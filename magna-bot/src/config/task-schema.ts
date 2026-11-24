import { isAddress, parseGwei, type Address } from "viem";
import { z } from "zod";
import { SUPPORTED_CHAINS, type ChainId } from "../types/mint.js";

const eVMAddressSchema = z.custom<Address>(
  (value) => typeof value === "string" && isAddress(value),
  "Invalid EVM Address",
);

export const WalletAllocationConfigSchema = z
  .object({
    walletId: z.string().min(1),
    walletAddress: eVMAddressSchema,
    quantity: z.number().int().positive(),
    maxAllowedPerWallet: z.number().int().positive(),
  })
  .refine(
    (allocation) => allocation.quantity <= allocation.maxAllowedPerWallet,
    {
      message: "Quantity cannot exceed maximum allowed",
      path: ["quantity"],
    },
  );

const chainIdSchema = z
  .number()
  .int()
  .refine(
    (id): id is ChainId => SUPPORTED_CHAINS.some((chain) => chain.id === id),
    "Unsupported chain ID",
  );

export const ChainConfigSchema = z.object({
  chainId: chainIdSchema,
  name: z.string(),
  rpcUrl: z.url(),
  wsrpcUrl: z.url().optional(),
  seadropAddress: eVMAddressSchema,
});

const positiveGweiSchema = z
  .string()
  .trim()
  .min(1, "Cannot be empty")
  .refine((value) => {
    try {
      return parseGwei(value) > 0;
    } catch {
      return false;
    }
  }, "Must be a valid Gwei Amount")
  .optional();

export const GasConfigSchema = z.object({
  maxFeePerGasGwei: positiveGweiSchema,
  maxPriorityFeePerGasGwei: positiveGweiSchema,
  gasLimitMultiplier: z.number().positive().min(1),
});

export const BaseMintStrategySchema = z.object({
  contractAddress: eVMAddressSchema,
  tokenStandard: z.union([z.literal("ERC721"), z.literal("ERC1155")]),
  mintPriceWei: z.bigint(),
  startTimeUnix: z.number(),
  endTimeUnix: z.number().optional(),
});

export const PublicDirectStrategySchema = BaseMintStrategySchema.extend({
  mode: z.literal("PUBLIC_DIRECT"),
  seadropAddress: eVMAddressSchema,
  feeRecipient: eVMAddressSchema,
  minterIfNotPayer: eVMAddressSchema.optional(),
});

export const PublicApiStrategySchema = BaseMintStrategySchema.extend({
  mode: z.literal("PUBLIC_API"),
  collectionSlug: z.string().min(1),
  stageId: z.string().trim().min(1).optional(),
});

export const SignedFcfsStrategySchema = BaseMintStrategySchema.extend({
  mode: z.literal("SIGNED_FCFS"),
  collectionSlug: z.string().min(1),
  seadropAddress: eVMAddressSchema,
  feeRecipient: eVMAddressSchema,
  requiresSiweAuth: z.boolean(),
});

export const MintStrategySchema = z.discriminatedUnion("mode", [
  PublicDirectStrategySchema,
  PublicApiStrategySchema,
  SignedFcfsStrategySchema,
]);

export const MintTaskConfigSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  chain: ChainConfigSchema,
  strategy: MintStrategySchema,
  gas: GasConfigSchema,
  allocations: z.array(WalletAllocationConfigSchema).min(1),
  createdAt: z.number(),
});
