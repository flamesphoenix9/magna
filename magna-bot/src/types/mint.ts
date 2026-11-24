import type { Address, Hex } from "viem";

export type TokenStandard = "ERC721" | "ERC1155";

export type TaskExecutionStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLING"
  | "CANCELLED"
  | "FAILED";

export type WalletExecutionStatus =
  | "QUEUED"
  | "PREFLIGHT"
  | "PREPARING"
  | "ARMED"
  | "SUBMITTING"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED";

export const SUPPORTED_CHAINS = [
  { id: 1, name: "Ethereum", openSeaSlug: "ethereum" },
  { id: 42161, name: "Arbitrum One", openSeaSlug: "arbitrum" },
  { id: 4063, name: "Robinhood", openSeaSlug: "robinhood" },
  // Add other chains here using the verified chain ID.
] as const;

export type ChainId = (typeof SUPPORTED_CHAINS)[number]["id"];

export interface ChainConfig {
  chainId: ChainId;
  name: string;
  rpcUrl: string;
  wsrpcUrl?: string;
  seadropAddress: Address;
}

export interface GasConfig {
  maxFeePerGasGwei?: string;
  maxPriorityFeePerGasGwei?: string;
  gasLimitMultiplier: number; // e.g., 1.15 for a 15% buffer
}

interface BaseMintStrategy {
  contractAddress: Address;
  tokenStandard: TokenStandard;
  mintPriceWei: bigint;
  startTimeUnix: number; // Unix timestamp in seconds
  endTimeUnix?: number;
}

export interface PublicDirectStrategy extends BaseMintStrategy {
  mode: "PUBLIC_DIRECT";
  seadropAddress: Address;
  feeRecipient: Address;
  minterIfNotPayer?: Address;
}

export interface PublicApiStrategy extends BaseMintStrategy {
  mode: "PUBLIC_API";
  collectionSlug: string;
  stageId?: string;
}

export interface SignedFcfsStrategy extends BaseMintStrategy {
  mode: "SIGNED_FCFS";
  collectionSlug: string;
  seadropAddress: Address;
  feeRecipient: Address;
  requiresSiweAuth: boolean; // Whether OpenSea API requires wallet bearer token
}

export type MintStrategy =
  | PublicDirectStrategy
  | PublicApiStrategy
  | SignedFcfsStrategy;

// 4. Wallet Allocation (Per-Wallet Execution Unit)
export interface WalletAllocationConfig {
  walletId: string;
  walletAddress: Address;
  quantity: number;
  maxAllowedPerWallet: number;
}
export interface WalletExecutionResult {
  walletId: string;
  status: WalletExecutionStatus;
  txHash?: Hex;
  errorMessage?: string;
  updatedAt: number;
}

// 5. Master Task Configuratio
export interface MintTaskConfig {
  id: string;
  name: string;
  chain: ChainConfig;
  strategy: MintStrategy;
  gas: GasConfig;
  allocations: WalletAllocationConfig[];
  createdAt: number;
}

// Task Execution Results
export interface MintTaskExecution {
  taskId: string;
  status: TaskExecutionStatus;
  walletResults: WalletExecutionResult[];
  startedAt?: number;
  completedAt?: number;
}
