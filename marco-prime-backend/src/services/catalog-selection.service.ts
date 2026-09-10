import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const storedSelectionSchema = z.object({
  version: z.literal(1),
  productIds: z.array(z.number().int().positive()),
});

class CatalogSelectionService {
  private selectedProductIds: Set<number> | null | undefined;

  private get selectionPath() {
    const dataDirectory = process.env.MARCO_DATA_DIR || "./data";
    return path.join(dataDirectory, "catalog-selection.json");
  }

  async getSelectedProductIds(): Promise<number[] | null> {
    if (this.selectedProductIds !== undefined) {
      return this.selectedProductIds
        ? [...this.selectedProductIds]
        : null;
    }

    try {
      const stored = storedSelectionSchema.parse(
        JSON.parse(await readFile(this.selectionPath, "utf8")),
      );
      this.selectedProductIds = new Set(stored.productIds);
      return [...this.selectedProductIds];
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        // No local configuration yet: preserve the historical behaviour and
        // offer every product Fouaille currently marks as available.
        this.selectedProductIds = null;
        return null;
      }
      throw error;
    }
  }

  async isSelected(productId: number) {
    const selectedProductIds = await this.getSelectedProductIds();
    return selectedProductIds === null || selectedProductIds.includes(productId);
  }

  async replace(productIds: number[]) {
    const uniqueProductIds = [...new Set(productIds)].sort((a, b) => a - b);
    const targetPath = this.selectionPath;
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ version: 1, productIds: uniqueProductIds }, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, targetPath);
    this.selectedProductIds = new Set(uniqueProductIds);
    return uniqueProductIds.length;
  }

  resetForTests() {
    this.selectedProductIds = undefined;
  }
}

export const catalogSelectionService = new CatalogSelectionService();
