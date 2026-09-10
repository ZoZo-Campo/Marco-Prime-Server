import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../config/database.js";
import { productTypes, products } from "../db/schema.js";

export class CatalogSelectionRepository {
  async findAvailableCatalog() {
    return await db
      .select({
        id: products.id,
        title: products.title,
        name: products.name,
        color: products.color,
        price: products.price,
        productTypeId: productTypes.id,
        productType: productTypes.type,
      })
      .from(products)
      .innerJoin(productTypes, eq(products.productTypeId, productTypes.id))
      .where(eq(products.available, true))
      .orderBy(asc(productTypes.id), asc(products.id));
  }

  async countAvailableProducts(productIds: number[]) {
    if (productIds.length === 0) return 0;
    const validProducts = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(inArray(products.id, productIds), eq(products.available, true)),
      );
    return validProducts.length;
  }
}
