import { MintTaskConfigSchema } from "../config/task-schema.js";
import type {
  MintTaskExecution, WalletExecutionStatus
} from "../types/mint.js";
import type { Hex } from "viem";
type ParsedMintTaskConfig = ReturnType<typeof MintTaskConfigSchema.parse>;


export interface StoredTask {
  config: ParsedMintTaskConfig;
  execution: MintTaskExecution;
  resumeStatus?: "SCHEDULED" | "RUNNING";
}

export interface ITaskStore{
    createTask(input: unknown): Promise<StoredTask> | StoredTask;
    getTask(id: string): Promise<StoredTask | undefined> | StoredTask | undefined;
    listTasks(): Promise<StoredTask[]> | StoredTask[];
    scheduleTask(id: string): Promise<StoredTask> | StoredTask;
    startTask(id: string): Promise<StoredTask> | StoredTask;
    resumeTask(id: string): Promise<StoredTask> | StoredTask;
    pauseTask(id: string): Promise<StoredTask> | StoredTask;
    updateWalletStatus(
        taskId: string,
        walletId: string,
        newStatus: WalletExecutionStatus,
        details?: { txHash?: Hex; errorMessage?: string },
    ): Promise<StoredTask> | StoredTask;
}