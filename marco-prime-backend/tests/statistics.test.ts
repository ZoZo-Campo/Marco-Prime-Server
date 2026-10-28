import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { testClient } from "hono/testing";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { db } from "../src/config/database.js";
import { members, orders, products } from "../src/db/schema.js";
import { productCostService } from "../src/services/product-cost.service.js";
import { accountingService } from "../src/services/accounting.service.js";
import { authenticatedOptions } from "./utils/helpers.js";

describe("Statistics endpoints", () => {
  const client = testClient(app);
  let dataDirectory: string;
  let adminCardNumber: number;
  let memberCardNumber: number;
  let memberId: number;
  let productId: number;
  let productName: string;
  let from: string;
  let to: string;

  beforeAll(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), "marco-statistics-"));
    process.env.MARCO_DATA_DIR = dataDirectory;
    productCostService.resetForTests();

    const [admin] = await db
      .select({ cardNumber: members.cardNumber })
      .from(members)
      .where(eq(members.admin, true))
      .limit(1);
    const [member] = await db
      .select({ id: members.id, cardNumber: members.cardNumber })
      .from(members)
      .where(eq(members.admin, false))
      .limit(1);
    const [product] = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .orderBy(asc(products.id))
      .limit(1);
    const [latestOrder] = await db
      .select({ date: orders.date })
      .from(orders)
      .orderBy(desc(orders.date))
      .limit(1);

    if (!admin?.cardNumber || !member?.cardNumber || !product || !latestOrder) {
      throw new Error("Statistics tests require seeded demo data");
    }
    adminCardNumber = admin.cardNumber;
    memberCardNumber = member.cardNumber;
    memberId = member.id;
    productId = product.id;
    productName = product.name;
    const start = new Date(latestOrder.date);
    start.setDate(start.getDate() - 1);
    const end = new Date(latestOrder.date);
    end.setDate(end.getDate() + 1);
    from = start.toISOString();
    to = end.toISOString();
  });

  afterAll(async () => {
    productCostService.resetForTests();
    accountingService.resetForTests();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it("requires an administrator for statistics", async () => {
    const response = await client.api.v1.statistics.$post(
      { json: { adminCardNumber: memberCardNumber, from, to } },
      authenticatedOptions,
    );
    expect(response.status).toBe(403);
  });

  it("returns sales and accounting totals for an administrator", async () => {
    const response = await client.api.v1.statistics.$post(
      { json: { adminCardNumber, from, to } },
      authenticatedOptions,
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.summary.unitsSold).toBeGreaterThanOrEqual(0);
    expect(result.summary.revenue).toMatch(/^-?\d+\.\d{2}$/);
    expect(Array.isArray(result.products)).toBe(true);
  });

  it("rejects an invalid date range", async () => {
    const response = await client.api.v1.statistics.$post(
      { json: { adminCardNumber, from: to, to: from } },
      authenticatedOptions,
    );
    expect(response.status).toBe(400);
  });

  it("stores purchase costs locally and returns them", async () => {
    const update = await client.api.v1.statistics.costs.$put(
      {
        json: {
          adminCardNumber,
          costs: [{ productId, costPrice: "1.23" }],
        },
      },
      authenticatedOptions,
    );
    expect(update.status).toBe(200);

    const response = await client.api.v1.statistics.costs.$post(
      { json: { adminCardNumber } },
      authenticatedOptions,
    );
    expect(response.status).toBe(200);
    const costs = await response.json();
    expect(costs.find((product) => product.id === productId)?.costPrice).toBe(
      "1.23",
    );
  });

  it("links accounting rows to catalogue products and restores their canonical names", async () => {
    const update = await client.api.v1.accounting.$put(
      {
        json: {
          adminCardNumber,
          eventName: "Soirée test",
          eventDate: "2030-01-01",
          rows: [
            {
              id: "f31efb78-158b-4f28-914f-8f42c86e98f9",
              productId,
              label: "Nom modifié dans le navigateur",
              liters: "19.57",
              purchasePricePerLiter: "3.14",
              revenue: "63.80",
            },
          ],
        },
      },
      authenticatedOptions,
    );
    expect(update.status).toBe(200);
    const saved = await update.json();
    expect(saved.rows[0]?.productId).toBe(productId);
    expect(saved.rows[0]?.label).toBe(productName);

    const read = await client.api.v1.accounting.$post(
      { json: { adminCardNumber } },
      authenticatedOptions,
    );
    expect(read.status).toBe(200);
    expect((await read.json()).rows[0]?.label).toBe(productName);
  });

  it("exports accounting, sales, recharges and corrections for a date range", async () => {
    const response = await client.api.v1.accounting.export.$post(
      { json: { adminCardNumber, from, to } },
      authenticatedOptions,
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.accounting).toHaveProperty("eventName");
    expect(Array.isArray(result.sales)).toBe(true);
    expect(Array.isArray(result.recharges)).toBe(true);
    expect(Array.isArray(result.corrections)).toBe(true);
  });

  it("stores the accounting closure status", async () => {
    const update = await client.api.v1.accounting.$put(
      {
        json: {
          adminCardNumber,
          status: "closed",
          eventName: "Soirée clôturée",
          eventDate: "2030-01-01",
          rows: [],
        },
      },
      authenticatedOptions,
    );
    expect(update.status).toBe(200);
    const result = await update.json();
    expect(result.status).toBe("closed");
    expect(result.closedAt).not.toBeNull();
  });

  it("rejects an accounting row linked to an unknown product", async () => {
    const response = await client.api.v1.accounting.$put(
      {
        json: {
          adminCardNumber,
          eventName: "Soirée test",
          eventDate: "2030-01-01",
          rows: [
            {
              id: "5c74c5c7-461e-41dc-a6e1-09c084b52a93",
              productId: 2_147_483_647,
              label: "Produit inexistant",
              liters: "1",
              purchasePricePerLiter: "1",
              revenue: "1",
            },
          ],
        },
      },
      authenticatedOptions,
    );
    expect(response.status).toBe(400);
  });

  it("normalizes current and legacy sales when calculating profit", async () => {
    await client.api.v1.statistics.costs.$put(
      {
        json: {
          adminCardNumber,
          costs: [{ productId, costPrice: "1.00" }],
        },
      },
      authenticatedOptions,
    );

    const created = await db
      .insert(orders)
      .values([
        {
          productId,
          memberId,
          price: "-2.00",
          amount: 2,
          date: new Date("2030-01-01T18:00:00.000Z"),
        },
        {
          productId,
          memberId,
          price: "1.00",
          amount: 2,
          date: new Date("2030-01-01T19:00:00.000Z"),
        },
      ])
      .$returningId();

    try {
      const response = await client.api.v1.statistics.$post(
        {
          json: {
            adminCardNumber,
            from: "2030-01-01T00:00:00.000Z",
            to: "2030-01-02T00:00:00.000Z",
          },
        },
        authenticatedOptions,
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.summary.unitsSold).toBe(4);
      expect(result.summary.revenue).toBe("4.00");
      expect(result.summary.cost).toBe("4.00");
      expect(result.summary.profit).toBe("0.00");
      expect(result.summary.legacyLineCount).toBe(1);
    } finally {
      await db.delete(orders).where(inArray(orders.id, created.map(({ id }) => id)));
    }
  });
});
