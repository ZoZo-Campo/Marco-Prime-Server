import { and, asc, gte, isNotNull, isNull, lt, eq } from "drizzle-orm";
import { db } from "../config/database.js";
import { members, orders, products, productTypes } from "../db/schema.js";

export class StatisticsRepository {
  async findSales(from: Date, to: Date) {
    return await db
      .select({
        id: orders.id,
        productId: products.id,
        productName: products.name,
        category: productTypes.type,
        memberId: members.id,
        price: orders.price,
        amount: orders.amount,
        date: orders.date,
      })
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .innerJoin(productTypes, eq(products.productTypeId, productTypes.id))
      .leftJoin(members, eq(orders.memberId, members.id))
      .where(
        and(
          isNotNull(orders.productId),
          gte(orders.date, from),
          lt(orders.date, to),
        ),
      );
  }

  async findRecharges(from: Date, to: Date) {
    return await db
      .select({ price: orders.price, amount: orders.amount })
      .from(orders)
      .where(
        and(
          isNull(orders.productId),
          gte(orders.date, from),
          lt(orders.date, to),
        ),
      );
  }

  async findProducts() {
    return await db
      .select({
        id: products.id,
        name: products.name,
        category: productTypes.type,
        sellingPrice: products.price,
        available: products.available,
      })
      .from(products)
      .innerJoin(productTypes, eq(products.productTypeId, productTypes.id))
      .orderBy(asc(productTypes.id), asc(products.id));
  }
}
