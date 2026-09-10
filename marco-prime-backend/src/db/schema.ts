import { relations } from "drizzle-orm";
import * as t from "drizzle-orm/mysql-core";

export const members = t.mysqlTable("members", {
  id: t
    .bigint("id", { mode: "number", unsigned: true })
    .notNull()
    .primaryKey()
    .autoincrement(),
  lastName: t.varchar("last_name", { length: 50 }).notNull(),
  firstName: t.varchar("first_name", { length: 50 }).notNull(),
  cardNumber: t.bigint("card_number", { mode: "number" }),
  email: t.varchar("email", { length: 255 }).notNull(),
  phone: t.varchar("phone", { length: 50 }),
  balance: t
    .decimal("balance", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  admin: t.boolean("admin").notNull().default(false),
  contributor: t.boolean("contributor").notNull().default(false),
  birthDate: t.date("birth_date"),
  sector: t.varchar("sector", { length: 255 }),
  createdAt: t.timestamp("created_at").notNull().defaultNow(),
  class: t.int("class"),
});

export const productTypes = t.mysqlTable("product_types", {
  id: t
    .bigint("id", { mode: "number", unsigned: true })
    .notNull()
    .primaryKey()
    .autoincrement(),
  type: t.varchar("type", { length: 50 }).notNull(),
});

export const products = t.mysqlTable("products", {
  id: t
    .bigint("id", { mode: "number", unsigned: true })
    .notNull()
    .primaryKey()
    .autoincrement(),
  name: t.varchar("name", { length: 50 }).notNull(),
  title: t.varchar("title", { length: 25 }).notNull(),
  price: t
    .decimal("price", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  productTypeId: t
    .bigint("product_type_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => productTypes.id),
  color: t.varchar("color", { length: 50 }),
  available: t.boolean("available").notNull().default(true),
});

export const orders = t.mysqlTable("orders", {
  id: t
    .bigint("id", { mode: "number", unsigned: true })
    .notNull()
    .primaryKey()
    .autoincrement(),
  productId: t
    .bigint("product_id", { mode: "number", unsigned: true })
    .references(() => products.id),
  memberId: t
    .bigint("member_id", { mode: "number", unsigned: true })
    .references(() => members.id),
  price: t.decimal("price", { precision: 10, scale: 2 }).notNull(),
  amount: t.int("amount").notNull(),
  date: t.timestamp("date").notNull().defaultNow(),
});

// Relations
export const membersRelations = relations(members, ({ many }) => ({
  orders: many(orders),
}));

export const productTypesRelations = relations(productTypes, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  type: one(productTypes, {
    fields: [products.productTypeId],
    references: [productTypes.id],
  }),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  product: one(products, {
    fields: [orders.productId],
    references: [products.id],
  }),
  member: one(members, {
    fields: [orders.memberId],
    references: [members.id],
  }),
}));
