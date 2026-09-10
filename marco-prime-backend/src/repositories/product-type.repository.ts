import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db } from "../config/database.js";
import { productTypes, products } from "../db/schema.js";

export class ProductTypeRepository {
  async findAllWithAvailableProductCount(selectedProductIds: number[] | null) {
    if (selectedProductIds?.length === 0) return [];

    return await db
      .select({
        id: productTypes.id,
        type: productTypes.type,
        productCount: count(products.id),
      })
      .from(productTypes)
      .innerJoin(
        products,
        and(
          eq(products.productTypeId, productTypes.id),
          eq(products.available, true),
          selectedProductIds
            ? inArray(products.id, selectedProductIds)
            : undefined,
        ),
      )
      .groupBy(productTypes.id, productTypes.type)
      .orderBy(asc(productTypes.id));
  }
}
