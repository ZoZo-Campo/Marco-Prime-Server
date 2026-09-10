import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../config/database.js";
import { productTypes, products } from "../db/schema.js";

const fouailleProductSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(50),
  title: z.string().min(1).max(25),
  price: z
    .string()
    .regex(/^\d+(?:\.\d{1,2})?$/)
    .refine((price) => Number(price) > 0),
  color: z.string().nullable().optional(),
});

const fouailleCatalogSchema = z.object({
  data: z.array(
    z.object({
      id: z.number().int().positive(),
      product_type: z.string().min(1).max(50),
      products: z.array(fouailleProductSchema),
    }),
  ),
});

export type FouailleSyncResult = {
  categories: number;
  products: number;
  synchronizedAt: Date;
};

export function parseFouailleCatalog(payload: unknown) {
  return fouailleCatalogSchema.parse(payload);
}

export async function synchronizeFouailleCatalog(): Promise<FouailleSyncResult> {
  const endpoint =
    process.env.FOUAILLE_API_URL || "https://fouaille.bde-tps.fr/api/product";
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Fouaille API responded with HTTP ${response.status}`);
  }

  const catalog = parseFouailleCatalog(await response.json());
  if (
    catalog.data.length === 0 ||
    catalog.data.every((category) => category.products.length === 0)
  ) {
    throw new Error("Fouaille API returned an empty catalog");
  }
  const synchronizedProductIds = new Set<number>();

  await db.transaction(async (tx) => {
    // A product missing from the official response is no longer available, but
    // remains in the database so historical orders keep their references.
    await tx.update(products).set({ available: false });

    for (const category of catalog.data) {
      const [existingCategory] = await tx
        .select({ id: productTypes.id })
        .from(productTypes)
        .where(eq(productTypes.id, category.id))
        .limit(1);

      if (existingCategory) {
        await tx
          .update(productTypes)
          .set({ type: category.product_type })
          .where(eq(productTypes.id, category.id));
      } else {
        await tx.insert(productTypes).values({
          id: category.id,
          type: category.product_type,
        });
      }

      for (const product of category.products) {
        synchronizedProductIds.add(product.id);
        const values = {
          name: product.name,
          title: product.title,
          price: Number(product.price).toFixed(2),
          color: product.color || "#64748b",
          productTypeId: category.id,
          available: true,
        };
        const [existingProduct] = await tx
          .select({ id: products.id })
          .from(products)
          .where(eq(products.id, product.id))
          .limit(1);

        if (existingProduct) {
          await tx
            .update(products)
            .set(values)
            .where(eq(products.id, product.id));
        } else {
          await tx.insert(products).values({ id: product.id, ...values });
        }
      }
    }
  });

  return {
    categories: catalog.data.length,
    products: synchronizedProductIds.size,
    synchronizedAt: new Date(),
  };
}

export function startFouailleSynchronization() {
  // Synchronization can write product data. It must therefore be explicitly
  // enabled; a missing or misspelled variable keeps the remote DB untouched.
  if (process.env.FOUAILLE_SYNC_ENABLED !== "true") return;

  const configuredInterval = Number.parseInt(
    process.env.FOUAILLE_SYNC_INTERVAL_MS || "300000",
    10,
  );
  const intervalMs = Number.isFinite(configuredInterval)
    ? Math.max(configuredInterval, 60_000)
    : 300_000;

  let synchronizationInProgress = false;
  const synchronize = async () => {
    if (synchronizationInProgress) return;
    synchronizationInProgress = true;
    try {
      const result = await synchronizeFouailleCatalog();
      console.log(
        `Fouaille catalog synchronized: ${result.categories} categories, ${result.products} products`,
      );
    } catch (error) {
      console.error(
        "Fouaille catalog synchronization failed; keeping the local catalog",
        error,
      );
    } finally {
      synchronizationInProgress = false;
    }
  };

  void synchronize();
  const timer = setInterval(synchronize, intervalMs);
  timer.unref();
}
