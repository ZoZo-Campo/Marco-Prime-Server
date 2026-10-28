import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const pendingSchema = z.object({
  status: z.literal("pending"),
  originalOrderId: z.number().int().positive(),
  adminMemberId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(250),
  createdAt: z.string().datetime(),
});

const completedSchema = pendingSchema.omit({ status: true }).extend({
  status: z.literal("completed"),
  cancellationOrderId: z.number().int().positive(),
  memberId: z.number().int().positive(),
  amount: z.string(),
  previousBalance: z.string(),
  newBalance: z.string(),
  completedAt: z.string().datetime(),
});

const recordSchema = z.discriminatedUnion("status", [
  pendingSchema,
  completedSchema,
]);
const storedSchema = z.object({
  version: z.literal(1),
  corrections: z.array(recordSchema),
});

export type PendingRechargeCorrection = z.infer<typeof pendingSchema>;
export type CompletedRechargeCorrection = z.infer<typeof completedSchema>;
export type RechargeCorrectionRecord = z.infer<typeof recordSchema>;

class RechargeCorrectionService {
  private records: RechargeCorrectionRecord[] | undefined;
  private mutationQueue: Promise<void> = Promise.resolve();

  private get filePath() {
    return path.join(
      process.env.MARCO_DATA_DIR || "./data",
      "recharge-corrections.json",
    );
  }

  async all() {
    if (!this.records) {
      try {
        this.records = storedSchema.parse(
          JSON.parse(await readFile(this.filePath, "utf8")),
        ).corrections;
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          this.records = [];
        } else {
          throw error;
        }
      }
    }
    return [...this.records];
  }

  async findOriginal(orderId: number) {
    return (await this.all()).find(
      (record) => record.originalOrderId === orderId,
    );
  }

  async reserve(record: Omit<PendingRechargeCorrection, "status">) {
    return this.mutate(async (records) => {
      if (
        records.some(
          (entry) => entry.originalOrderId === record.originalOrderId,
        )
      ) {
        throw new Error("RECHARGE_ALREADY_CORRECTED");
      }
      return [...records, { ...record, status: "pending" as const }];
    });
  }

  async complete(
    originalOrderId: number,
    result: Omit<
      CompletedRechargeCorrection,
      | "status"
      | "reason"
      | "adminMemberId"
      | "createdAt"
      | "completedAt"
      | "originalOrderId"
    >,
  ) {
    return this.mutate(async (records) => {
      const pending = records.find(
        (entry) =>
          entry.originalOrderId === originalOrderId &&
          entry.status === "pending",
      );
      if (!pending) throw new Error("RECHARGE_CORRECTION_RESERVATION_MISSING");
      const completed: CompletedRechargeCorrection = {
        ...pending,
        ...result,
        status: "completed",
        completedAt: new Date().toISOString(),
      };
      return records.map((entry) =>
        entry.originalOrderId === originalOrderId ? completed : entry,
      );
    });
  }

  async removePending(originalOrderId: number) {
    return this.mutate(async (records) =>
      records.filter(
        (entry) =>
          entry.originalOrderId !== originalOrderId ||
          entry.status !== "pending",
      ),
    );
  }

  private async mutate(
    operation: (
      records: RechargeCorrectionRecord[],
    ) => Promise<RechargeCorrectionRecord[]>,
  ) {
    let release: (() => void) | undefined;
    const previous = this.mutationQueue;
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const next = await operation(await this.all());
      await this.write(next);
      this.records = next;
    } finally {
      release?.();
    }
  }

  private async write(records: RechargeCorrectionRecord[]) {
    const targetPath = this.filePath;
    const temporaryPath = `${targetPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ version: 1, corrections: records }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporaryPath, targetPath);
  }

  resetForTests() {
    this.records = undefined;
    this.mutationQueue = Promise.resolve();
  }
}

export const rechargeCorrectionService = new RechargeCorrectionService();
