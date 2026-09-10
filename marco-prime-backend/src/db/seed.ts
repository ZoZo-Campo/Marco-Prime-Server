import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { seed } from "drizzle-seed";
import mysql from "mysql2/promise";
import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not defined");

const parsedDatabaseUrl = new URL(databaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "mysql"]);
if (!localHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error("Seed refused: only a local Docker database can be reset");
}

const connection = await mysql.createConnection(databaseUrl);
const db = drizzle(connection);

async function main() {
  console.log("Resetting database...");

  // Delete in order to respect foreign key constraints
  await db.delete(schema.orders);
  await db.delete(schema.products);
  await db.delete(schema.members);
  await db.delete(schema.productTypes);

  console.log("Database reset completed!");
  console.log("Starting database seed...");

  await seed(db, schema, { seed: 1 }).refine((f) => ({
    productTypes: {
      count: 4,
      columns: {
        type: f.valuesFromArray({
          values: ["Boisson", "Snack", "Repas", "Dessert"],
        }),
      },
    },
    members: {
      count: 30,
      columns: {
        lastName: f.lastName(),
        firstName: f.firstName(),
        cardNumber: f.int({ minValue: 1000, maxValue: 9999, isUnique: true }),
        email: f.email(),
        phone: f.phoneNumber({ template: "06########" }),
        balance: f.number({ minValue: 0, maxValue: 150, precision: 100 }),
        admin: f.valuesFromArray({
          values: [true, false, false, false, false, false, false, false, false, false],
        }),
        contributor: f.valuesFromArray({
          values: [true, true, true, false, false, false, false, false, false, false],
        }),
        birthDate: f.date({ minDate: "1980-01-01", maxDate: "2005-12-31" }),
        sector: f.valuesFromArray({
          values: [
            "Informatique",
            "Marketing",
            "Design",
            "RH",
            "Finance",
            "Commercial",
            "Logistique",
            "Production",
          ],
        }),
        class: f.int({ minValue: 2020, maxValue: 2026 }),
      },
    },
    products: {
      count: 20,
      columns: {
        name: f.valuesFromArray({
          values: [
            "Coca-Cola",
            "Pepsi",
            "Eau",
            "Jus d'orange",
            "Café",
            "Thé",
            "Chips",
            "Cacahuètes",
            "Biscuits",
            "Chocolat",
            "Sandwich jambon",
            "Sandwich poulet",
            "Wrap végétarien",
            "Salade",
            "Pizza",
            "Brownie",
            "Cookie",
            "Muffin",
            "Fruit",
            "Yaourt",
          ],
        }),
        title: f.valuesFromArray({
          values: [
            "Coca 33cl",
            "Pepsi 33cl",
            "Eau 50cl",
            "Jus orange 25cl",
            "Café expresso",
            "Thé vert",
            "Chips salées",
            "Cacahuètes grillées",
            "Biscuits chocolat",
            "Chocolat noir",
            "Sandwich jambon-beurre",
            "Sandwich poulet crudités",
            "Wrap végé",
            "Salade composée",
            "Pizza margherita",
            "Brownie chocolat",
            "Cookie pépites choco",
            "Muffin myrtille",
            "Fruit de saison",
            "Yaourt nature",
          ],
        }),
        price: f.number({ minValue: 0.5, maxValue: 8, precision: 100 }),
        productTypeId: f.int({ minValue: 1, maxValue: 4 }),
        color: f.valuesFromArray({
          values: ["red", "red", "red", "blue", "green", "brown", "yellow", undefined, undefined],
        }),
        available: f.valuesFromArray({
          values: [true, true, true, true, true, true, true, true, false, false],
        }),
      },
    },
    orders: {
      count: 100,
      columns: {
        productId: f.int({ minValue: 1, maxValue: 20 }),
        memberId: f.int({ minValue: 1, maxValue: 30 }),
        // Fouaille stores purchase line totals as negative ledger amounts.
        price: f.number({ minValue: -40, maxValue: -0.5, precision: 100 }),
        amount: f.int({ minValue: 1, maxValue: 5 }),
        date: f.date({ minDate: "2024-01-01", maxDate: "2026-01-13" }),
      },
    },
  }));

  console.log("Database seed completed successfully!");
  console.log("- 4 product types");
  console.log("- 30 members");
  console.log("- 20 products");
  console.log("- 100 orders");

  await connection.end();
}

main().catch((error) => {
  console.error("Error seeding database:", error);
  process.exit(1);
});
