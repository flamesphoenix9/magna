import assert from "node:assert";
import { MintTaskConfigSchema } from "../../src/config/task-schema.js";
const baseTask = {
    id: "task-1",
    name: "Schema test",
    chain: {
        chainId: 1,
        name: "Ethereum",
        rpcUrl: "https://rpc.example",
        seadropAddress: "0x0000000000000000000000000000000000000001",
    },
    gas: {
        gasLimitMultiplier: 1.1,
    },
    allocations: [
        {
            walletId: "wallet-1",
            walletAddress: "0x0000000000000000000000000000000000000002",
            quantity: 1,
            maxAllowedPerWallet: 1,
        },
    ],
    createdAt: Date.now(),
};
const sharedStrategy = {
    contractAddress: "0x0000000000000000000000000000000000000003",
    tokenStandard: "ERC721",
    mintPriceWei: 0n,
    startTimeUnix: 1_000_000,
};
const strategies = [
    {
        ...sharedStrategy,
        mode: "PUBLIC_DIRECT",
        seadropAddress: "0x0000000000000000000000000000000000000004",
        feeRecipient: "0x0000000000000000000000000000000000000005",
    },
    {
        ...sharedStrategy,
        mode: "PUBLIC_API",
        collectionSlug: "test_nft_slug",
        stageId: "1",
    },
    {
        ...sharedStrategy,
        mode: "SIGNED_FCFS",
        collectionSlug: "test_nft_slug",
        seadropAddress: "0x0000000000000000000000000000000000000004",
        feeRecipient: "0x0000000000000000000000000000000000000005",
        requiresSiweAuth: false,
    },
];
for (const strategy of strategies) {
    assert.equal(MintTaskConfigSchema.safeParse({ ...baseTask, strategy }).success, true);
}
// chainId is not part of registered chains 
const invalidChainTask = {
    ...baseTask,
    chain: { ...baseTask.chain, chainId: 999 },
    strategy: strategies[0],
};
assert.equal(MintTaskConfigSchema.safeParse(invalidChainTask).success, false);
// Some stategy data missing here e.g: collectionSlug
const missingStrategyFieldTask = {
    ...baseTask,
    strategy: { ...sharedStrategy, mode: "SIGNED_FCFS" }
};
assert.equal(MintTaskConfigSchema.safeParse(missingStrategyFieldTask).success, false);
// Invalid contract address for the NFT
const invalidContractAddressFieldTask = {
    ...baseTask,
    strategy: {
        ...strategies[0],
        contractAddress: "iuytghiuyt",
    },
};
assert.equal(MintTaskConfigSchema.safeParse(invalidContractAddressFieldTask).success, false);
console.log("Schema Check completed");
//# sourceMappingURL=task-schema.test.js.map