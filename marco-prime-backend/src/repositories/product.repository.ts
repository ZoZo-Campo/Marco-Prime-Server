import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "../config/database.js";
import { products } from "../db/schema.js";

export class ProductRepository {
  async findAll() {
    return await db
      .select({
        id: products.id,
        title: products.title,
        name: products.name,
        color: products.color,
        price: products.price,
        productTypeId: products.productTypeId,
        available: products.available,
      })
      .from(products);
  }

  async findById(productId: number) {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    return product;
  }

  async countAvailableByType(
    productTypeId: number,
    selectedProductIds: number[] | null,
  ) {
    if (selectedProductIds?.length === 0) return 0;

    const [{ total }] = await db
      .select({ total: count() })
      .from(products)
      .where(
        and(
          eq(products.productTypeId, productTypeId),
          eq(products.available, true),
          selectedProductIds
            ? inArray(products.id, selectedProductIds)
            : undefined,
        ),
      );

    return total;
  }

  async findAvailableByType(
    productTypeId: number,
    limit: number,
    offset: number,
    selectedProductIds: number[] | null,
  ) {
    if (selectedProductIds?.length === 0) return [];

    return await db
      .select({
        id: products.id,
        title: products.title,
        name: products.name,
        color: products.color,
        price: products.price,
        productTypeId: products.productTypeId,
        available: products.available,
      })
      .from(products)
      .where(
        and(
          eq(products.productTypeId, productTypeId),
          eq(products.available, true),
          selectedProductIds
            ? inArray(products.id, selectedProductIds)
            : undefined,
        ),
      )
      .limit(limit)
      .offset(offset);
  }
}
