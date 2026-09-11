import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/config/database.js";
import { members, orders, products } from "../src/db/schema.js";
import { app } from "../src/index.js";
import { orderCorrectionService } from "../src/services/order-correction.service.js";
import {
  authenticatedOptions,
  getAdminCardNumber,
  getAvailableProductIds,
  getBalanceByCardNumber,
  getNonAdminCardNumber,
  getOrderCount,
} from "./utils/helpers.js";

describe("Order correction endpoints", () => {
  const client = testClient(app);
  let dataDirectory: string;
  let adminCardNumber: number;
  let memberCardNumber: number;
  let memberId: number;
  let productIds: number[];

  beforeAll(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), "marco-correction-api-"));
    process.env.MARCO_DATA_DIR = dataDirectory;
    orderCorrectionService.resetForTests();
    adminCardNumber = await getAdminCardNumber();
    memberCardNumber = await getNonAdminCardNumber();
    productIds = await getAvailableProductIds(2);
    const [member] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.cardNumber, memberCardNumber))
      .limit(1);
    if (!member) throw new Error("Member missing for correction test");
    memberId = member.id;
  });

  afterAll(async () => {
    orderCorrectionService.resetForTests();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it("replaces product and quantity exactly once in one balance adjustment", async () => {
    const [originalProductId, replacementProductId] = productIds;
    if (!originalProductId || !replacementProductId) throw new Error("Products missing");
    const originalBalance = await getBalanceByCardNumber(memberCardNumber);
    const createdIds: number[] = [];

    try {
      const purchase = await client.api.v1.purchase.$post(
        {
          json: {
            transactionId: crypto.randomUUID(),
            cardNumber: memberCardNumber,
            items: [{ productId: originalProductId, amount: 2 }],
          },
        },
        authenticatedOptions,
      );
      expect(purchase.status).toBe(201);
      const purchaseBody = await purchase.json();
      const originalOrderId = purchaseBody.transaction.orderIds[0]!;
      createdIds.push(originalOrderId);

      const [replacementProduct] = await db
        .select({ price: products.price })
        .from(products)
        .where(eq(products.id, replacementProductId))
        .limit(1);
      if (!replacementProduct) throw new Error("Replacement product missing");

      const response = await client.api.v1["order-corrections"].apply.$post(
        {
          json: {
            adminCardNumber,
            originalOrderId,
            replacementProductId,
            replacementAmount: 3,
            reason: "Correction automatique de test",
          },
        },
        authenticatedOptions,
      );
      expect(response.status).toBe(201);
      const body = await response.json();
      createdIds.push(body.correction.refundOrderId);
      if (body.correction.replacementOrderId) {
        createdIds.push(body.correction.replacementOrderId);
      }

      const expectedCharge = toCents(replacementProduct.price) * 3;
      expect(toCents(body.correction.refunded)).toBe(
        toCents(purchaseBody.transaction.totalPrice),
      );
      expect(toCents(body.correction.charged)).toBe(expectedCharge);
      expect(toCents(await getBalanceByCardNumber(memberCardNumber))).toBe(
        toCents(originalBalance) - expectedCharge,
      );

      const countAfterCorrection = await getOrderCount();
      const retry = await client.api.v1["order-corrections"].apply.$post(
        {
          json: {
            adminCardNumber,
            originalOrderId,
            replacementProductId,
            replacementAmount: 3,
            reason: "Seconde tentative de test",
          },
        },
        authenticatedOptions,
      );
      expect(retry.status).toBe(409);
      expect(await getOrderCount()).toBe(countAfterCorrection);
      expect(toCents(await getBalanceByCardNumber(memberCardNumber))).toBe(
        toCents(originalBalance) - expectedCharge,
      );
    } finally {
      if (createdIds.length > 0) {
        await db.delete(orders).where(inArray(orders.id, createdIds));
      }
      await db
        .update(members)
        .set({ balance: originalBalance })
        .where(eq(members.id, memberId));
    }
  });

  it("cancels a sale and restores its complete amount", async () => {
    const productId = productIds[0];
    if (!productId) throw new Error("Product missing");
    const originalBalance = await getBalanceByCardNumber(memberCardNumber);
    const createdIds: number[] = [];

    try {
      const purchase = await client.api.v1.purchase.$post(
        {
          json: {
            transactionId: crypto.randomUUID(),
            cardNumber: memberCardNumber,
            items: [{ productId, amount: 2 }],
          },
        },
        authenticatedOptions,
      );
      const purchaseBody = await purchase.json();
      const originalOrderId = purchaseBody.transaction.orderIds[0]!;
      createdIds.push(originalOrderId);

      const response = await client.api.v1["order-corrections"].apply.$post(
        {
          json: {
            adminCardNumber,
            originalOrderId,
            replacementProductId: null,
            replacementAmount: 0,
            reason: "Annulation automatique de test",
          },
        },
        authenticatedOptions,
      );
      expect(response.status).toBe(201);
      const body = await response.json();
      createdIds.push(body.correction.refundOrderId);
      expect(body.correction.replacementOrderId).toBeNull();
      expect(body.correction.charged).toBe("0.00");
      expect(await getBalanceByCardNumber(memberCardNumber)).toBe(originalBalance);
    } finally {
      if (createdIds.length > 0) {
        await db.delete(orders).where(inArray(orders.id, createdIds));
      }
      await db
        .update(members)
        .set({ balance: originalBalance })
        .where(eq(members.id, memberId));
    }
  });
});

function toCents(value: string) {
  return Math.round(Number(value) * 100);
}
