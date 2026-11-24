import "dotenv/config";

import { askText, closePrompts } from "./engine/prompt.js";
import {
  fetchOpenSeaDrop,
  OpenSeaFetcherError,
  type OpenSeaDropDetails,
  type OpenSeaDropStage,
} from "./engine/opensea-fetcher.js";
import { SUPPORTED_CHAINS } from "./types/mint.js";

function formatTime(value: string | number | undefined): string {
  if (value === undefined) return "Not provided";
  const date =
    typeof value === "number"
      ? new Date(value < 10_000_000_000 ? value * 1000 : value)
      : new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : `${date.toISOString()} (${date.toLocaleString()})`;
}

function formatStage(stage: OpenSeaDropStage, index: number): void {
  console.log(`\nStage ${index + 1}${stage.label ? `: ${stage.label}` : ""}`);
  if (stage.uuid) console.log(`  ID: ${stage.uuid}`);
  if (stage.type) console.log(`  Type: ${stage.type}`);
  if (stage.price !== undefined) {
    console.log(`  Price: ${JSON.stringify(stage.price)}`);
  }
  console.log(`  Starts: ${formatTime(stage.startTime)}`);
  console.log(`  Ends: ${formatTime(stage.endTime)}`);
  if (stage.maxPerWallet !== undefined) {
    console.log(`  Max per wallet: ${stage.maxPerWallet}`);
  }
}

function displayDrop(drop: OpenSeaDropDetails): void {
  console.log("\nOpenSea drop found");
  console.log("==================");
  console.log(`Collection: ${drop.collectionName}`);
  console.log(`Slug: ${drop.collectionSlug}`);
  if (drop.openseaUrl) console.log(`OpenSea: ${drop.openseaUrl}`);
  if (drop.description) console.log(`Description: ${drop.description}`);

  if (drop.contracts.length === 0) {
    console.log("Contracts: OpenSea did not return contract details");
  } else {
    console.log("Contracts:");
    for (const contract of drop.contracts) {
      const chainName = contract.chainId
        ? SUPPORTED_CHAINS.find((chain) => chain.id === contract.chainId)?.name
        : undefined;
      console.log(
        `  ${contract.address}${contract.chain ? ` (${chainName ?? contract.chain})` : ""}${contract.tokenStandard ? ` — ${contract.tokenStandard}` : ""}`,
      );
    }
  }

  if (drop.stages.length === 0) {
    console.log("\nNo mint stages were returned by OpenSea.");
  } else {
    drop.stages.forEach(formatStage);
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error(
      "OPENSEA_API_KEY is missing. Add your OpenSea API key to the local .env file.",
    );
  }

  console.log("OpenSea drop lookup");
  console.log("Enter a collection slug, contract address, or OpenSea link.\n");

  const input = await askText("Collection slug / contract address / link: ");
  if (!input) {
    throw new Error("An OpenSea slug, contract address, or link is required.");
  }

  const drop = await fetchOpenSeaDrop(input, { apiKey });
  displayDrop(drop);

  const confirmation = await askText(
    "\nIs this the NFT/drop you intended? [y/N]: ",
  );
  if (!["y", "yes"].includes(confirmation.toLowerCase())) {
    console.log("Not confirmed. No task was created.");
    return;
  }

  console.log("Drop confirmed. Task creation is the next CLI step.");
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof OpenSeaFetcherError || error instanceof Error
        ? error.message
        : "An unexpected error occurred.";
    console.error(`\nUnable to look up OpenSea drop: ${message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    closePrompts();
  });
