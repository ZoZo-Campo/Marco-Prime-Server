import { relations } from "drizzle-orm";
import * as t from "drizzle-orm/mysql-core";

export const members = t.mysqlTable(
  "members",
  {
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
  },
  (table) => [
    // Deux membres ne doivent jamais partager le même badge : sinon une
    // carte peut créditer ou débiter la mauvaise personne. MySQL autorise
    // plusieurs valeurs NULL, ce qui convient aux membres sans badge.
    t.uniqueIndex("members_card_number_unique").on(table.cardNumber),
    t.index("members_class_idx").on(table.class),
  ],
);

export const productTypes = t.mysqlTable("product_types", {
  id: t
    .bigint("id", { mode: "number", unsigned: true })
    .notNull()
    .primaryKey()
    .autoincrement(),
  type: t.varchar("type", { length: 50 }).notNull(),
});

export const products = t.mysqlTable(
  "products",
  {
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
  },
  (table) => [t.index("products_product_type_idx").on(table.productTypeId)],
);

export const orders = t.mysqlTable(
  "orders",
  {
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
  },
  (table) => [
    // L'historique, la comptabilité et les statistiques filtrent et trient
    // sur la date et les identifiants : sans ces index, chaque écran scanne
    // toute la table.
    t.index("orders_date_idx").on(table.date),
    t.index("orders_member_idx").on(table.memberId),
    t.index("orders_product_idx").on(table.productId),
  ],
);

/**
 * Clés d'idempotence des opérations financières.
 *
 * Une même transaction ne doit produire qu'un seul débit ou crédit, même
 * après un redémarrage, une coupure réseau ou deux instances de l'API.
 * La clé est insérée dans la même transaction SQL que les écritures : si
 * l'opération échoue, la clé disparaît avec elle ; si elle réussit, la
 * réponse est conservée pour être rejouée à l'identique.
 */
export const idempotencyKeys = t.mysqlTable(
  "idempotency_keys",
  {
    transactionId: t
      .varchar("transaction_id", { length: 36 })
      .notNull()
      .primaryKey(),
    scope: t.varchar("scope", { length: 20 }).notNull(),
    requestHash: t.varchar("request_hash", { length: 64 }).notNull(),
    responseJson: t.longtext("response_json").notNull(),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    t.index("idempotency_keys_created_at_idx").on(table.createdAt),
  ],
);

/**
 * Garde anti-double-correction en base.
 *
 * Le journal JSON reste utile pour l'affichage détaillé, mais il ne doit
 * jamais être la seule preuve qu'une commande a déjà été remboursée : un
 * volume perdu ou une restauration partielle ne doit pas permettre un second
 * remboursement. La contrainte UNIQUE sur original_order_id le garantit.
 */
export const orderCorrections = t.mysqlTable(
  "order_corrections",
  {
    id: t
      .bigint("id", { mode: "number", unsigned: true })
      .notNull()
      .primaryKey()
      .autoincrement(),
    originalOrderId: t
      .bigint("original_order_id", { mode: "number", unsigned: true })
      .notNull(),
    kind: t.varchar("kind", { length: 20 }).notNull(),
    adminMemberId: t
      .bigint("admin_member_id", { mode: "number", unsigned: true })
      .notNull(),
    reason: t.varchar("reason", { length: 250 }).notNull(),
    refundOrderId: t
      .bigint("refund_order_id", { mode: "number", unsigned: true })
      .notNull(),
    replacementOrderId: t
      .bigint("replacement_order_id", { mode: "number", unsigned: true }),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    t
      .uniqueIndex("order_corrections_original_unique")
      .on(table.originalOrderId),
    t.index("order_corrections_refund_idx").on(table.refundOrderId),
    t.index("order_corrections_replacement_idx").on(table.replacementOrderId),
  ],
);

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
