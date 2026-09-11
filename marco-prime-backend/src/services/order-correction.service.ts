import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const pendingRecordSchema = z.object({
  status: z.literal("pending"),
  originalOrderId: z.number().int().positive(),
  replacementProductId: z.number().int().positive().nullable(),
  replacementAmount: z.number().int().nonnegative(),
  reason: z.string(),
  adminMemberId: z.number().int().positive(),
  createdAt: z.string().datetime(),
});

const completedRecordSchema = pendingRecordSchema.omit({
  replacementProductId: true,
  replacementAmount: true,
}).extend({
  status: z.literal("completed"),
  refundOrderId: z.number().int().positive(),
  replacementOrderId: z.number().int().positive().nullable(),
  originalProductId: z.number().int().positive(),
  replacementProductId: z.number().int().positive().nullable(),
  originalAmount: z.number().int().positive(),
  replacementAmount: z.number().int().nonnegative(),
  refunded: z.string(),
  charged: z.string(),
  balanceChange: z.string(),
  previousBalance: z.string(),
  newBalance: z.string(),
  completedAt: z.string().datetime(),
});

const recordSchema = z.discriminatedUnion("status", [
  pendingRecordSchema,
  completedRecordSchema,
]);
const storedSchema = z.object({
  version: z.literal(1),
  corrections: z.array(recordSchema),
});

export type PendingCorrectionRecord = z.infer<typeof pendingRecordSchema>;
export type CompletedCorrectionRecord = z.infer<typeof completedRecordSchema>;
export type CorrectionRecord = z.infer<typeof recordSchema>;

class OrderCorrectionService {
  private records: CorrectionRecord[] | undefined;
  private mutationQueue: Promise<void> = Promise.resolve();

  private get filePath() {
    return path.join(
      process.env.MARCO_DATA_DIR || "./data",
      "order-corrections.json",
    );
  }

  async all() {
    if (!this.records) {
      try {
        this.records = storedSchema.parse(
          JSON.parse(await readFile(this.filePath, "utf8")),
        ).corrections;
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
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

  async reserve(record: Omit<PendingCorrectionRecord, "status">) {
    return this.mutate(async (records) => {
      if (records.some((entry) => entry.originalOrderId === record.originalOrderId)) {
        throw new Error("ORDER_ALREADY_CORRECTED");
      }
      return [...records, { ...record, status: "pending" as const }];
    });
  }

  async complete(
    originalOrderId: number,
    result: Omit<CompletedCorrectionRecord, "status" | "reason" | "adminMemberId" | "createdAt" | "completedAt">,
  ) {
    return this.mutate(async (records) => {
      const pending = records.find(
        (entry) =>
          entry.originalOrderId === originalOrderId && entry.status === "pending",
      );
      if (!pending) throw new Error("CORRECTION_RESERVATION_MISSING");
      const completed: CompletedCorrectionRecord = {
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
          entry.originalOrderId !== originalOrderId || entry.status !== "pending",
      ),
    );
  }

  private async mutate(
    operation: (records: CorrectionRecord[]) => Promise<CorrectionRecord[]>,
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

  private async write(records: CorrectionRecord[]) {
    const targetPath = this.filePath;
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;
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

export const orderCorrectionService = new OrderCorrectionService();
