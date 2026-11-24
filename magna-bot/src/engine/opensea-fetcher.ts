import { getAddress, isAddress, type Address } from "viem";
import { SUPPORTED_CHAINS, type ChainId } from "../types/mint.js";

const API_BASE_URL = "https://api.opensea.io/api/v2";
const REQUEST_TIMEOUT_MS = 10_000;

export interface OpenSeaDropStage {
  uuid?: string;
  label?: string;
  type?: string;
  price?: unknown;
  startTime?: string | number;
  endTime?: string | number;
  maxPerWallet?: number;
  raw: Record<string, unknown>;
}

export interface OpenSeaDropContract {
  address: Address;
  chain?: string;
  chainId?: ChainId;
  tokenStandard?: string;
}

export interface OpenSeaDropDetails {
  collectionSlug: string;
  collectionName: string;
  description?: string;
  openseaUrl?: string;
  contracts: OpenSeaDropContract[];
  stages: OpenSeaDropStage[];
  raw: Record<string, unknown>;
}

export interface OpenSeaFetcherOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class OpenSeaFetcherError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "OpenSeaFetcherError";
  }
}

type ResolvedInput =
  | { kind: "slug"; slug: string }
  | { kind: "contract"; address: Address; chainSlug?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(
  value: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function firstTime(
  value: Record<string, unknown>,
  keys: string[],
): string | number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (
      typeof candidate === "string" ||
      (typeof candidate === "number" && Number.isFinite(candidate))
    ) {
      return candidate;
    }
  }
  return undefined;
}

function normalizeInput(input: string): ResolvedInput {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new OpenSeaFetcherError("Enter an OpenSea collection slug, contract address, or link.");
  }

  if (isAddress(trimmed)) {
    return { kind: "contract", address: getAddress(trimmed) };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new OpenSeaFetcherError("The OpenSea link is not a valid URL.");
    }

    if (
      url.protocol !== "https:" ||
      (url.hostname !== "opensea.io" && url.hostname !== "www.opensea.io")
    ) {
      throw new OpenSeaFetcherError("Only https://opensea.io links are supported.");
    }

    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));

    if (parts[0] === "collection" && parts[1]) {
      return { kind: "slug", slug: parts[1] };
    }

    if ((parts[0] === "assets" || parts[0] === "item") && parts.length >= 4) {
      const chainSlug = parts[1]?.toLowerCase();
      const address = parts[2];
      if (address && isAddress(address)) {
        return {
          kind: "contract",
          address: getAddress(address),
          ...(chainSlug ? { chainSlug } : {}),
        };
      }
    }

    throw new OpenSeaFetcherError(
      "Link must be an OpenSea collection link or an NFT asset link containing a contract address.",
    );
  }

  if (trimmed.includes("/") || trimmed.length > 200) {
    throw new OpenSeaFetcherError("Enter a collection slug, contract address, or supported OpenSea link.");
  }

  return { kind: "slug", slug: trimmed };
}

function getConfiguredChainId(chainSlug: string): ChainId | undefined {
  return SUPPORTED_CHAINS.find((chain) => chain.openSeaSlug === chainSlug)?.id;
}

async function requestJson(
  path: string,
  options: Required<Pick<OpenSeaFetcherOptions, "apiKey">> &
    Pick<OpenSeaFetcherOptions, "fetchImpl" | "timeoutMs">,
  allowNotFound = false,
): Promise<unknown | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(`${API_BASE_URL}${path}`, {
      headers: {
        accept: "application/json",
        "X-API-KEY": options.apiKey,
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch (error) { 
    const reason = error instanceof Error ? error.message : "unknown network error";
    throw new OpenSeaFetcherError(`OpenSea request failed: ${reason}`);
  }

  if (allowNotFound && response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const detail =
      response.status === 401 || response.status === 403
        ? "Check that the OpenSea API key is valid and enabled."
        : response.status === 429
          ? "OpenSea rate limit reached; wait before retrying."
          : `OpenSea returned HTTP ${response.status}.`;
    throw new OpenSeaFetcherError(detail, response.status);
  }

  try {
    return await response.json();
  } catch {
    throw new OpenSeaFetcherError("OpenSea returned an invalid JSON response.", response.status);
  }
}

async function findContractCollection(
  address: Address,
  chainSlug: string | undefined,
  options: OpenSeaFetcherOptions,
): Promise<{ slug: string; contract: OpenSeaDropContract }> {
  const candidates = chainSlug
    ? [chainSlug]
    : SUPPORTED_CHAINS.map((chain) => chain.openSeaSlug);

  if (chainSlug && !getConfiguredChainId(chainSlug)) {
    throw new OpenSeaFetcherError(
      `The asset is on "${chainSlug}", which is not in the configured supported-chain list.`,
    );
  }

  const matches = await Promise.all(
    candidates.map(async (candidate) => {
      const result = await requestJson(
        `/chain/${encodeURIComponent(candidate)}/contract/${encodeURIComponent(address)}`,
        options,
        true,
      );
      if (result === null) return undefined;
      if (!isRecord(result)) {
        throw new OpenSeaFetcherError("OpenSea returned an invalid contract response.");
      }

      const slug = firstString(result, ["collection"]);
      if (!slug) {
        throw new OpenSeaFetcherError("OpenSea contract response did not contain a collection slug.");
      }

      const chainId = getConfiguredChainId(candidate);
      const tokenStandard = firstString(result, [
        "contract_standard",
        "contractStandard",
      ]);
      return {
        slug,
        contract: {
          address,
          chain: candidate,
          ...(chainId !== undefined ? { chainId } : {}),
          ...(tokenStandard ? { tokenStandard } : {}),
        },
      };
    }),
  );
  const found = matches.filter(
    (match): match is NonNullable<typeof match> => match !== undefined,
  );

  if (found.length === 0) {
    throw new OpenSeaFetcherError(
      `OpenSea could not find contract ${address} on the configured chains.`,
    );
  }
  if (found.length > 1) {
    throw new OpenSeaFetcherError(
      `Contract ${address} exists on multiple configured chains; use an OpenSea asset link to specify the chain.`,
    );
  }

  return found[0]!;
}

function parseContract(value: unknown): OpenSeaDropContract | undefined {
  if (!isRecord(value)) return undefined;
  const address = firstString(value, ["address", "contract_address", "contractAddress"]);
  if (!address || !isAddress(address)) return undefined;

  const chain = firstString(value, ["chain"]);
  const chainId = chain ? getConfiguredChainId(chain) : undefined;
  const tokenStandard = firstString(value, ["token_standard", "tokenStandard"]);
  return {
    address: getAddress(address),
    ...(chain ? { chain } : {}),
    ...(chainId !== undefined ? { chainId } : {}),
    ...(tokenStandard ? { tokenStandard } : {}),
  };
}

function parseStage(value: unknown): OpenSeaDropStage | undefined {
  if (!isRecord(value)) return undefined;
  const uuid = firstString(value, ["uuid", "stage_uuid", "id"]);
  const label = firstString(value, ["label", "name"]);
  const type = firstString(value, ["type", "stage_type"]);
  const startTime = firstTime(value, ["startTime", "start_time"]);
  const endTime = firstTime(value, ["endTime", "end_time"]);
  const maxPerWallet = value.maxPerWallet ?? value.max_per_wallet;

  return {
    ...(uuid ? { uuid } : {}),
    ...(label ? { label } : {}),
    ...(type ? { type } : {}),
    ...(value.price !== undefined ? { price: value.price } : {}),
    ...(startTime !== undefined ? { startTime } : {}),
    ...(endTime !== undefined ? { endTime } : {}),
    ...(typeof maxPerWallet === "number" ? { maxPerWallet } : {}),
    raw: value,
  };
}

function parseDrop(
  value: unknown,
  requestedSlug: string,
  resolvedContract?: OpenSeaDropContract,
): OpenSeaDropDetails {
  if (!isRecord(value)) {
    throw new OpenSeaFetcherError("OpenSea returned an invalid drop response.");
  }

  const collectionSlug =
    firstString(value, ["collectionSlug", "collection_slug", "slug"]) ??
    requestedSlug;
  const collectionName = firstString(value, [
    "collectionName",
    "collection_name",
    "name",
  ]);
  if (!collectionName) {
    throw new OpenSeaFetcherError(
      "OpenSea drop response did not contain a collection name; cannot confirm the requested NFT.",
    );
  }

  const contractsValue = value.contracts;
  const contracts = Array.isArray(contractsValue)
    ? contractsValue.map(parseContract).filter(
        (contract): contract is OpenSeaDropContract => contract !== undefined,
      )
    : [];
  const singleContract = parseContract(value.contract);
  const directContract = parseContract({
    address: value.contractAddress ?? value.contract_address,
    chain: value.chain,
    tokenStandard: value.tokenStandard ?? value.token_standard,
  });
  for (const contract of [singleContract, directContract, resolvedContract]) {
    if (
      contract &&
      !contracts.some(
        (existing) =>
          existing.address.toLowerCase() === contract.address.toLowerCase() &&
          existing.chain === contract.chain,
      )
    ) {
      contracts.push(contract);
    }
  }

  const stagesValue = value.stages;
  const stages = Array.isArray(stagesValue)
    ? stagesValue.map(parseStage).filter(
        (stage): stage is OpenSeaDropStage => stage !== undefined,
      )
    : [];

  const description = firstString(value, ["description"]);
  const openseaUrl = firstString(value, ["openseaUrl", "opensea_url"]);

  return {
    collectionSlug,
    collectionName,
    ...(description ? { description } : {}),
    ...(openseaUrl ? { openseaUrl } : {}),
    contracts,
    stages,
    raw: value,
  };
}

export async function fetchOpenSeaDrop(
  input: string,
  options: OpenSeaFetcherOptions,
): Promise<OpenSeaDropDetails> {
  if (!options.apiKey.trim()) {
    throw new OpenSeaFetcherError("OpenSea API key is required.");
  }

  const resolvedInput = normalizeInput(input);
  let slug: string;
  let resolvedContract: OpenSeaDropContract | undefined;

  if (resolvedInput.kind === "contract") {
    const match = await findContractCollection(
      resolvedInput.address,
      resolvedInput.chainSlug,
      options,
    );
    slug = match.slug;
    resolvedContract = match.contract;
  } else {
    slug = resolvedInput.slug;
  }

  const response = await requestJson(
    `/drops/${encodeURIComponent(slug)}`,
    options,
  );
  const drop = parseDrop(response, slug, resolvedContract);

  if (
    resolvedContract &&
    !drop.contracts.some(
      (contract) =>
        contract.address.toLowerCase() ===
        resolvedContract.address.toLowerCase(),
    )
  ) {
    throw new OpenSeaFetcherError(
      "The drop details did not include the contract address used to look it up.",
    );
  }

  return drop;
}
