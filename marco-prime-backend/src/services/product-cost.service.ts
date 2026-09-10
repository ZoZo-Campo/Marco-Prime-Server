import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const storedCostsSchema = z.object({
  version: z.literal(1),
  costs: z.array(
    z.object({
      productId: z.number().int().positive(),
      costPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    }),
  ),
});

class ProductCostService {
  private costs: Map<number, string> | undefined;

  private get costsPath() {
    return path.join(
      process.env.MARCO_DATA_DIR || "./data",
      "product-costs.json",
    );
  }

  async getCosts() {
    if (this.costs) return new Map(this.costs);

    try {
      const stored = storedCostsSchema.parse(
        JSON.parse(await readFile(this.costsPath, "utf8")),
      );
      this.costs = new Map(
        stored.costs.map(({ productId, costPrice }) => [
          productId,
          normalizeMoney(costPrice),
        ]),
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        this.costs = new Map();
      } else {
        throw error;
      }
    }

    return new Map(this.costs);
  }

  async replace(entries: Array<{ productId: number; costPrice: string }>) {
    const costs = entries
      .map(({ productId, costPrice }) => ({
        productId,
        costPrice: normalizeMoney(costPrice),
      }))
      .sort((a, b) => a.productId - b.productId);
    const targetPath = this.costsPath;
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ version: 1, costs }, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, targetPath);
    this.costs = new Map(
      costs.map(({ productId, costPrice }) => [productId, costPrice]),
    );
    return costs.length;
  }

  resetForTests() {
    this.costs = undefined;
  }
}

function normalizeMoney(value: string) {
  return Number(value).toFixed(2);
}

export const productCostService = new ProductCostService();
