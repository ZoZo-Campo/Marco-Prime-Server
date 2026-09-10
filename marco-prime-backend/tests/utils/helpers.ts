import { asc, count, eq } from "drizzle-orm";
import { db } from "../../src/config/database.js";
import { members, orders, products } from "../../src/db/schema.js";

export const authenticatedOptions = {
  headers: {
    Authorization: `Bearer ${process.env.API_TOKEN}`,
    "Content-Type": "application/json",
  },
};

export const getAdminCardNumber = async () => {
  const admin = await db
    .select()
    .from(members)
    .where(eq(members.admin, true))
    .limit(1);

  if (admin.length === 0) {
    throw new Error("No admin user found in the database.");
  }
  if (!admin[0].cardNumber) {
    throw new Error("Admin user does not have a card number.");
  }

  return admin[0].cardNumber;
};

export const getNonAdminCardNumber = async () => {
  const admin = await db
    .select()
    .from(members)
    .where(eq(members.admin, false))
    .limit(1);

  if (admin.length === 0) {
    throw new Error("No non-admin user found in the database.");
  }
  if (!admin[0].cardNumber) {
    throw new Error("Non-admin user does not have a card number.");
  }

  return admin[0].cardNumber;
};

export const getAvailableProductId = async () => {
  const product = await db
    .select()
    .from(products)
    .where(eq(products.available, true))
    .limit(1);

  if (product.length === 0) {
    throw new Error("No available product found in the database.");
  }

  return product[0].id;
};

export const getAvailableProductIds = async (limit = 2) => {
  const availableProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.available, true))
    .orderBy(asc(products.id))
    .limit(limit);

  if (availableProducts.length < limit) {
    throw new Error(`At least ${limit} available products are required.`);
  }

  return availableProducts.map((product) => product.id);
};

export const getBalanceByCardNumber = async (cardNumber: number) => {
  const [member] = await db
    .select({ balance: members.balance })
    .from(members)
    .where(eq(members.cardNumber, cardNumber))
    .limit(1);

  if (!member) throw new Error("Member not found.");
  return member.balance;
};

export const getOrderById = async (orderId: number) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) throw new Error("Order not found.");
  return order;
};

export const getOrderCount = async () => {
  const [{ total }] = await db.select({ total: count() }).from(orders);
  return total;
};

export const getUnavailableProductId = async () => {
  const product = await db
    .select()
    .from(products)
    .where(eq(products.available, false))
    .limit(1);

  if (product.length === 0) {
    throw new Error("No unavailable product found in the database.");
  }

  return product[0].id;
};
