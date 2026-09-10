import { count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../config/database.js";
import { members, orders, products } from "../db/schema.js";

export class OrderRepository {
  async countAll() {
    const [{ total }] = await db.select({ total: count() }).from(orders);
    return total;
  }

  async findMany(limit: number, offset: number) {
    return await db
      .select({
        id: orders.id,
        product: {
          id: products.id,
          name: products.name,
        },
        member: {
          id: members.id,
          firstName: members.firstName,
          lastName: members.lastName,
          balance: members.balance,
        },
        price: orders.price,
        amount: orders.amount,
        date: orders.date,
      })
      .from(orders)
      .leftJoin(products, eq(orders.productId, products.id))
      .leftJoin(members, eq(orders.memberId, members.id))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(orders.date), desc(orders.id));
  }

  async createCartPurchaseTransaction(
    memberId: number,
    requestedItems: Array<{ productId: number; amount: number }>,
    selectedProductIds: number[] | null,
  ): Promise<{
    orderIds: number[];
    orderDate: Date;
    previousBalance: string;
    newBalance: string;
    totalPrice: string;
    items: Array<{
      product: {
        id: number;
        name: string;
        title: string;
        price: string;
      };
      amount: number;
      totalPrice: string;
    }>;
  }> {
    return await db.transaction(async (tx) => {
      const [lockedMember] = await tx
        .select({ balance: members.balance })
        .from(members)
        .where(eq(members.id, memberId))
        .limit(1)
        .for("update");

      if (!lockedMember) throw new Error("Member not found during purchase");

      const productIds = requestedItems.map((item) => item.productId);
      const databaseProducts = await tx
        .select({
          id: products.id,
          name: products.name,
          title: products.title,
          price: products.price,
          available: products.available,
        })
        .from(products)
        .where(inArray(products.id, productIds));
      const productById = new Map(
        databaseProducts.map((product) => [product.id, product]),
      );
      const selectedSet = selectedProductIds
        ? new Set(selectedProductIds)
        : null;

      const receiptItems = requestedItems.map((item) => {
        const product = productById.get(item.productId);
        if (!product) throw new Error(`PRODUCT_NOT_FOUND:${item.productId}`);
        if (!product.available) {
          throw new Error(`PRODUCT_UNAVAILABLE:${item.productId}`);
        }
        if (selectedSet && !selectedSet.has(item.productId)) {
          throw new Error(`PRODUCT_NOT_SELECTED:${item.productId}`);
        }
        const unitPriceCents = toCents(product.price);
        if (unitPriceCents === null || unitPriceCents <= 0) {
          throw new Error(`INVALID_PRODUCT_PRICE:${item.productId}`);
        }
        const lineTotalCents = unitPriceCents * item.amount;
        if (
          !Number.isSafeInteger(lineTotalCents) ||
          lineTotalCents > MAX_DATABASE_MONEY_CENTS
        ) {
          throw new Error(`INVALID_PRODUCT_PRICE:${item.productId}`);
        }
        return {
          product: {
            id: product.id,
            name: product.name,
            title: product.title,
            price: product.price,
          },
          amount: item.amount,
          totalPrice: fromCents(lineTotalCents),
          ledgerPrice: fromCents(-lineTotalCents),
          lineTotalCents,
        };
      });

      const totalCents = receiptItems.reduce(
        (total, item) => total + item.lineTotalCents,
        0,
      );
      if (
        !Number.isSafeInteger(totalCents) ||
        totalCents <= 0 ||
        totalCents > MAX_DATABASE_MONEY_CENTS
      ) {
        throw new Error("INVALID_PURCHASE_TOTAL");
      }

      const currentBalanceCents = toCents(lockedMember.balance);
      if (currentBalanceCents === null) {
        throw new Error("INVALID_MEMBER_BALANCE");
      }
      const newBalanceCents = currentBalanceCents - totalCents;
      const ledgerTotalCents = receiptItems.reduce(
        (total, item) => total - item.lineTotalCents,
        0,
      );
      if (
        newBalanceCents >= currentBalanceCents ||
        ledgerTotalCents !== -totalCents ||
        currentBalanceCents + ledgerTotalCents !== newBalanceCents ||
        Math.abs(newBalanceCents) > MAX_DATABASE_MONEY_CENTS
      ) {
        throw new Error("INVALID_MEMBER_BALANCE");
      }
      const newBalance = fromCents(newBalanceCents);

      const orderIds: number[] = [];
      for (const item of receiptItems) {
        const [order] = await tx
          .insert(orders)
          .values({
            productId: item.product.id,
            memberId,
            // Fouaille stores a signed line total: purchases are negative.
            price: item.ledgerPrice,
            amount: item.amount,
          })
          .$returningId();
        orderIds.push(order.id);
      }

      await tx
        .update(members)
        .set({ balance: newBalance })
        .where(eq(members.id, memberId));

      const [createdOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderIds[0]!))
        .limit(1);

      return {
        orderIds,
        orderDate: createdOrder.date,
        previousBalance: lockedMember.balance,
        newBalance,
        totalPrice: fromCents(totalCents),
        items: receiptItems.map((item) => ({
          product: item.product,
          amount: item.amount,
          totalPrice: item.totalPrice,
        })),
      };
    });
  }

  async createRechargeTransaction(
    memberId: number,
    amount: number,
  ): Promise<{
    orderId: number;
    orderDate: Date;
    previousBalance: string;
    newBalance: string;
  }> {
    return await db.transaction(async (tx) => {
      const amountCents = toCents(amount.toFixed(2));
      if (
        amountCents === null ||
        amountCents <= 0 ||
        amountCents > MAX_DATABASE_MONEY_CENTS
      ) {
        throw new Error("INVALID_RECHARGE_AMOUNT");
      }

      const [lockedMember] = await tx
        .select({ balance: members.balance })
        .from(members)
        .where(eq(members.id, memberId))
        .limit(1)
        .for("update");

      if (!lockedMember) throw new Error("Member not found during recharge");

      const currentBalanceCents = toCents(lockedMember.balance);
      if (currentBalanceCents === null) {
        throw new Error("INVALID_MEMBER_BALANCE");
      }
      const newBalanceCents = currentBalanceCents + amountCents;
      if (
        newBalanceCents <= currentBalanceCents ||
        currentBalanceCents + amountCents !== newBalanceCents ||
        Math.abs(newBalanceCents) > MAX_DATABASE_MONEY_CENTS
      ) {
        throw new Error("INVALID_MEMBER_BALANCE");
      }
      const newBalance = fromCents(newBalanceCents);

      const [order] = await tx
        .insert(orders)
        .values({
          productId: null,
          memberId,
          // Fouaille stores recharges as positive ledger entries.
          price: fromCents(amountCents),
          amount: 1,
        })
        .$returningId();

      await tx
        .update(members)
        .set({ balance: newBalance })
        .where(eq(members.id, memberId));

      const [createdOrder] = await tx
        .select({ date: orders.date })
        .from(orders)
        .where(eq(orders.id, order.id))
        .limit(1);

      if (!createdOrder) throw new Error("Recharge ledger entry not found");

      return {
        orderId: order.id,
        orderDate: createdOrder.date,
        previousBalance: lockedMember.balance,
        newBalance,
      };
    });
  }
}

const MAX_DATABASE_MONEY_CENTS = 9_999_999_999;

function toCents(value: string): number | null {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function fromCents(value: number) {
  return (value / 100).toFixed(2);
}
