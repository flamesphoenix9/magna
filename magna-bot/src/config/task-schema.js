"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MintTaskConfigSchema = exports.MintStrategySchema = exports.SignedFcfsStrategySchema = exports.PublicApiStrategySchema = exports.PublicDirectStrategySchema = exports.BaseMintStrategySchema = exports.GasConfigSchema = exports.ChainConfigSchema = exports.WalletAllocationConfigSchema = void 0;
var viem_1 = require("viem");
var zod_1 = require("zod");
var mint_js_1 = require("../types/mint.js");
var eVMAddressSchema = zod_1.z.custom(function (value) { return typeof value === "string" && (0, viem_1.isAddress)(value); }, "Invalid EVM Address");
exports.WalletAllocationConfigSchema = zod_1.z
    .object({
    walletId: zod_1.z.string().min(1),
    walletAddress: eVMAddressSchema,
    quantity: zod_1.z.number().int().positive(),
    maxAllowedPerWallet: zod_1.z.number().int().positive(),
})
    .refine(function (allocation) { return allocation.quantity <= allocation.maxAllowedPerWallet; }, {
    message: "Quantity cannot exceed maximum allowed",
    path: ["quantity"],
});
var chainIdSchema = zod_1.z
    .number()
    .int()
    .refine(function (id) { return mint_js_1.SUPPORTED_CHAINS.some(function (chain) { return chain.id === id; }); }, "Unsupported chain ID");
exports.ChainConfigSchema = zod_1.z.object({
    chainId: chainIdSchema,
    name: zod_1.z.string(),
    rpcUrl: zod_1.z.url(),
    wsrpcUrl: zod_1.z.url().optional(),
    seadropAddress: eVMAddressSchema,
});
var positiveGweiSchema = zod_1.z
    .string()
    .trim()
    .min(1, "Cannot be empty")
    .refine(function (value) {
    try {
        return (0, viem_1.parseGwei)(value) > 0;
    }
    catch (_a) {
        return false;
    }
}, "Must be a valid Gwei Amount")
    .optional();
exports.GasConfigSchema = zod_1.z.object({
    maxFeePerGasGwei: positiveGweiSchema,
    maxPriorityFeePerGasGwei: positiveGweiSchema,
    gasLimitMultiplier: zod_1.z.number().positive().min(1),
});
exports.BaseMintStrategySchema = zod_1.z.object({
    contractAddress: eVMAddressSchema,
    tokenStandard: zod_1.z.union([zod_1.z.literal("ERC721"), zod_1.z.literal("ERC1155")]),
    mintPriceWei: zod_1.z.bigint(),
    startTimeUnix: zod_1.z.number(),
    endTimeUnix: zod_1.z.number().optional(),
});
exports.PublicDirectStrategySchema = exports.BaseMintStrategySchema.extend({
    mode: zod_1.z.literal("PUBLIC_DIRECT"),
    seadropAddress: eVMAddressSchema,
    feeRecipient: eVMAddressSchema,
    minterIfNotPayer: eVMAddressSchema.optional(),
});
exports.PublicApiStrategySchema = exports.BaseMintStrategySchema.extend({
    mode: zod_1.z.literal("PUBLIC_API"),
    collectionSlug: zod_1.z.string().min(1),
    stageId: zod_1.z.string().trim().min(1).optional(),
});
exports.SignedFcfsStrategySchema = exports.BaseMintStrategySchema.extend({
    mode: zod_1.z.literal("SIGNED_FCFS"),
    collectionSlug: zod_1.z.string().min(1),
    seaDropAddress: eVMAddressSchema,
    feeRecipient: eVMAddressSchema,
    requiresSiweAuth: zod_1.z.boolean(),
});
exports.MintStrategySchema = zod_1.z.discriminatedUnion("mode", [
    exports.PublicDirectStrategySchema,
    exports.PublicApiStrategySchema,
    exports.SignedFcfsStrategySchema,
]);
exports.MintTaskConfigSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string().trim().min(1),
    chain: exports.ChainConfigSchema,
    strategy: exports.MintStrategySchema,
    gas: exports.GasConfigSchema,
    allocations: zod_1.z.array(exports.WalletAllocationConfigSchema).min(1),
    createdAt: zod_1.z.number(),
});
