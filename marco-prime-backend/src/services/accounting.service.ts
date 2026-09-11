import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const rowSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  liters: z.string(),
  purchasePricePerLiter: z.string(),
  revenue: z.string(),
});

const storedSchema = z.object({
  version: z.literal(1),
  eventName: z.string(),
  eventDate: z.string(),
  rows: z.array(rowSchema),
  updatedAt: z.string().datetime(),
});

export type AccountingInput = {
  eventName: string;
  eventDate: string;
  rows: Array<z.infer<typeof rowSchema>>;
};

const emptyAccounting = (): z.infer<typeof storedSchema> => ({
  version: 1,
  eventName: "Soirée Marco",
  eventDate: new Date().toISOString().slice(0, 10),
  rows: [],
  updatedAt: new Date().toISOString(),
});

class AccountingService {
  private value: z.infer<typeof storedSchema> | undefined;

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

  async replace(input: AccountingInput) {
    const value = storedSchema.parse({
      version: 1,
      eventName: input.eventName.trim(),
      eventDate: input.eventDate,
      rows: input.rows.map((row) => ({
        ...row,
        label: row.label.trim(),
        liters: normalize(row.liters, 3),
        purchasePricePerLiter: normalize(row.purchasePricePerLiter, 4),
        revenue: normalize(row.revenue, 2),
      })),
      updatedAt: new Date().toISOString(),
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
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, targetPath);
}

export function accountingView(value: Awaited<ReturnType<AccountingService["get"]>>) {
  const rows = value.rows.map((row) => {
    const cost = Number(row.liters) * Number(row.purchasePricePerLiter);
    const result = Number(row.revenue) - cost;
    return { ...row, cost: cost.toFixed(2), result: result.toFixed(2) };
  });
  const totals = rows.reduce((sum, row) => ({
    liters: sum.liters + Number(row.liters),
    cost: sum.cost + Number(row.cost),
    revenue: sum.revenue + Number(row.revenue),
    result: sum.result + Number(row.result),
  }), { liters: 0, cost: 0, revenue: 0, result: 0 });
  return {
    ...value,
    rows,
    totals: {
      liters: totals.liters.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""),
      cost: totals.cost.toFixed(2),
      revenue: totals.revenue.toFixed(2),
      result: totals.result.toFixed(2),
    },
  };
}

export const accountingService = new AccountingService();
