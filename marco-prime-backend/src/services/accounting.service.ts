import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const rowSchema = z.object({
  id: z.string().uuid(),
  productId: z.number().int().positive().nullable().default(null),
  label: z.string(),
  liters: z.string(),
  units: z.string().default("0"),
  purchasePricePerLiter: z.string(),
  revenue: z.string(),
  salePrice: z.string().default("0"),
  saleFormat: z.enum(["unit", "25cl", "33cl", "50cl", "60cl"]).default("unit"),
});

const productDefaultSchema = z.object({
  productId: z.number().int().positive(),
  purchasePricePerLiter: z.string(),
});

const storedSchema = z.object({
  version: z.literal(1),
  status: z.enum(["draft", "closed"]).default("draft"),
  eventName: z.string(),
  eventDate: z.string(),
  eventStartTime: z.string().default("16:30"),
  eventEndTime: z.string().default("23:59"),
  rows: z.array(rowSchema),
  productDefaults: z.array(productDefaultSchema).default([]),
  closedAt: z.string().datetime().nullable().default(null),
  updatedAt: z.string().datetime(),
});
type StoredAccounting = z.infer<typeof storedSchema>;

export type AccountingInput = {
  status: "draft" | "closed";
  eventName: string;
  eventDate: string;
  eventStartTime?: string;
  eventEndTime?: string;
  rows: Array<z.input<typeof rowSchema> & { productId: number }>;
};

const emptyAccounting = (): z.infer<typeof storedSchema> => ({
  version: 1,
  status: "draft",
  eventName: "Soirée Marco",
  eventDate: new Date().toISOString().slice(0, 10),
  eventStartTime: "16:30",
  eventEndTime: "23:59",
  rows: [],
  productDefaults: [],
  closedAt: null,
  updatedAt: new Date().toISOString(),
});

class AccountingService {
  private value: StoredAccounting | undefined;
  private pendingWrite: Promise<unknown> = Promise.resolve();

  private get filePath() {
    return path.join(process.env.MARCO_DATA_DIR || "./data", "accounting.json");
  }

  async get() {
    if (this.value) return structuredClone(this.value);
    try {
      this.value = storedSchema.parse(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        this.value = emptyAccounting();
      } else {
        throw error;
      }
    }
    return structuredClone(this.value);
  }

  replace(input: AccountingInput): Promise<StoredAccounting> {
    const operation = this.pendingWrite
      .catch(() => undefined)
      .then(() => this.applyReplace(input));
    this.pendingWrite = operation.catch(() => undefined);
    return operation;
  }

  private async applyReplace(input: AccountingInput) {
    const current = await this.get();
    const now = new Date().toISOString();
    const productDefaults = new Map(
      current.productDefaults.map((entry) => [
        entry.productId,
        entry.purchasePricePerLiter,
      ]),
    );
    for (const row of input.rows) {
      if (Number(row.purchasePricePerLiter) > 0) {
        productDefaults.set(
          row.productId,
          normalize(row.purchasePricePerLiter, 4),
        );
      }
    }
    const value = storedSchema.parse({
      version: 1,
      status: input.status,
      eventName: input.eventName.trim(),
      eventDate: input.eventDate,
      eventStartTime: input.eventStartTime ?? "16:30",
      eventEndTime: input.eventEndTime ?? "23:59",
      rows: input.rows.map((row) => ({
        ...row,
        label: row.label.trim(),
        liters: normalize(row.liters, 3),
        units: normalize(row.units ?? "0", 2),
        purchasePricePerLiter: normalize(row.purchasePricePerLiter, 4),
        revenue: normalize(row.revenue, 2),
        salePrice: normalize(row.salePrice ?? "0", 2),
        saleFormat: row.saleFormat ?? "unit",
      })),
      productDefaults: [...productDefaults]
        .map(([productId, purchasePricePerLiter]) => ({
          productId,
          purchasePricePerLiter,
        }))
        .sort((left, right) => left.productId - right.productId),
      closedAt:
        input.status === "closed"
          ? current.status === "closed"
            ? (current.closedAt ?? now)
            : now
          : null,
      updatedAt: now,
    });
    await atomicWrite(this.filePath, value);
    this.value = value;
    return structuredClone(value);
  }

  resetForTests() {
    this.value = undefined;
  }
}

function normalize(value: string, decimals: number) {
  return Number(value).toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

async function atomicWrite(targetPath: string, value: unknown) {
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, targetPath);
}

const SALE_FORMAT_LITERS = {
  "25cl": 0.25,
  "33cl": 0.33,
  "50cl": 0.5,
  "60cl": 0.6,
} as const;

export function accountingView(value: Awaited<ReturnType<AccountingService["get"]>>) {
  const rows = value.rows.map((row) => {
    const liters = Number(row.liters);
    const units = Number(row.units ?? "0");
    const unitPrice = Number(row.purchasePricePerLiter);
    const quantity = units > 0 ? units : liters;
    const cost = quantity * unitPrice;
    const salePrice = Number(row.salePrice);
    const expectedRevenue = row.saleFormat === "unit"
      ? quantity * salePrice
      : (liters / SALE_FORMAT_LITERS[row.saleFormat]) * salePrice;
    const revenue = Number(row.revenue);
    const variance = revenue - expectedRevenue;
    const result = revenue - cost;
    return {
      ...row,
      liters: row.liters,
      units: row.units ?? "0",
      cost: cost.toFixed(2),
      expectedRevenue: expectedRevenue.toFixed(2),
      variance: variance.toFixed(2),
      result: result.toFixed(2),
    };
  });
  const totals = rows.reduce((sum, row) => ({
    liters: sum.liters + Number(row.liters),
    units: sum.units + Number(row.units ?? "0"),
    cost: sum.cost + Number(row.cost),
    expectedRevenue: sum.expectedRevenue + Number(row.expectedRevenue),
    revenue: sum.revenue + Number(row.revenue),
    variance: sum.variance + Number(row.variance),
    result: sum.result + Number(row.result),
  }), { liters: 0, units: 0, cost: 0, expectedRevenue: 0, revenue: 0, variance: 0, result: 0 });
  return {
    ...value,
    rows,
    totals: {
      liters: totals.liters.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""),
      units: totals.units.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""),
      cost: totals.cost.toFixed(2),
      expectedRevenue: totals.expectedRevenue.toFixed(2),
      revenue: totals.revenue.toFixed(2),
      variance: totals.variance.toFixed(2),
      result: totals.result.toFixed(2),
    },
  };
}

export const accountingService = new AccountingService();
