import type { Hex } from "viem";
import { MintTaskConfigSchema } from "../config/task-schema.js";
import type { WalletExecutionStatus } from "../types/mint.js";
import type { ITaskStore, StoredTask } from "./ITask-store.js";
const allowedWalletTransitions: Record<
  WalletExecutionStatus,
  readonly WalletExecutionStatus[]
> = {
  QUEUED: ["PREFLIGHT", "FAILED", "CANCELLED"],
  PREFLIGHT: ["PREPARING", "FAILED", "CANCELLED"],
  PREPARING: ["ARMED", "FAILED", "CANCELLED"],
  ARMED: ["SUBMITTING", "FAILED", "CANCELLED"],
  SUBMITTING: ["SUBMITTED", "FAILED"],
  SUBMITTED: ["CONFIRMED", "FAILED"],
  CONFIRMED: [],
  FAILED: [],
  CANCELLED: [],
};

export class TaskStore implements ITaskStore{
  private readonly tasks = new Map<string, StoredTask>();

  createTask(input: unknown): StoredTask {
    const config = MintTaskConfigSchema.parse(input);
    if (this.tasks.has(config.id)) {
      throw new Error(`Task with ID ${config.id} already exists`);
    }

    const walletIds = config.allocations.map(({ walletId }) => walletId);
    if (new Set(walletIds).size !== walletIds.length) {
      throw new Error(`Task ${config.id} contains duplicate wallet IDs`);
    }

    const now = Date.now();
    const task: StoredTask = {
      config,
      execution: {
        taskId: config.id,
        status: "DRAFT",
        walletResults: config.allocations.map(({ walletId }) => ({
          walletId,
          status: "QUEUED",
          updatedAt: now,
        })),
      },
    };

    this.tasks.set(config.id, task);
    return structuredClone(task);
  }

  getTask(id: string): StoredTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    return structuredClone(task);
  }

  listTasks(): StoredTask[] {
    return Array.from(this.tasks.values(), (task) => structuredClone(task));
  }

  scheduleTask(id: string): StoredTask {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task with ID ${id} was not found`);
    }
    if (task.execution.status !== "DRAFT") {
      throw new Error(
        `Cannot schedule task ${id} from status ${task.execution.status}`,
      );
    }
    task.execution.status = "SCHEDULED";
    return structuredClone(task);
  }
  startTask(id: string): StoredTask {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task with ID ${id} was not found`);
    }
    if (task.execution.status !== "SCHEDULED") {
      throw new Error(
        `Cannot start task ${id} from status ${task.execution.status}`,
      );
    }
    task.execution.status = "RUNNING";
    task.execution.startedAt = Date.now();
    return structuredClone(task);
  }

  resumeTask(id: string): StoredTask {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task with ID ${id} was not found`);
    }
    if (task.execution.status != "PAUSED") {
      throw new Error(
        `Cannot resume task ${id} from status ${task.execution.status}`,
      );
    }
    const resumeStatus = task.resumeStatus;
    if (!resumeStatus) {
      throw new Error(`Task ${id} has no status to resume to`);
    }
    task.execution.status = resumeStatus;
    delete task.resumeStatus;
    return structuredClone(task);
  }

  pauseTask(id: string): StoredTask {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task with ID ${id} was not found`);
    }
    if (
      task.execution.status !== "SCHEDULED" &&
      task.execution.status !== "RUNNING"
    ) {
      throw new Error(
        `Task cannot be paused, current status ${task.execution.status}`,
      );
    }
    task.resumeStatus = task.execution.status;
    task.execution.status = "PAUSED";
    return structuredClone(task);
  }

  updateWalletStatus(
    taskId: string,
    walletId: string,
    newStatus: WalletExecutionStatus,
    details?: { txHash?: Hex; errorMessage?: string },
  ): StoredTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task with ID ${taskId} was not found`);
    }
    if (task.execution.status !== "RUNNING") {
      throw new Error(
        `Cannot update wallet status while task ${taskId} is ${task.execution.status}`,
      );
    }

    const walletResult = task.execution.walletResults.find(
      (wallet) => wallet.walletId === walletId,
    );
    if (!walletResult) {
      throw new Error(`Wallet ${walletId} not found in task ${taskId}`);
    }

    if (!allowedWalletTransitions[walletResult.status].includes(newStatus)) {
      throw new Error(
        `Cannot transition wallet ${walletId} from ${walletResult.status} to ${newStatus}`,
      );
    }

    walletResult.status = newStatus;
    walletResult.updatedAt = Date.now();
    if (details?.txHash !== undefined) {
      walletResult.txHash = details.txHash;
    }
    if (details?.errorMessage !== undefined) {
      walletResult.errorMessage = details.errorMessage;
    }

    const terminalStatuses: WalletExecutionStatus[] = [
      "CONFIRMED",
      "FAILED",
      "CANCELLED",
    ];
    if (
      task.execution.walletResults.every((wallet) =>
        terminalStatuses.includes(wallet.status),
      )
    ) {
      task.execution.status = "COMPLETED";
      task.execution.completedAt = Date.now();
    }

    return structuredClone(task);
  }
}
