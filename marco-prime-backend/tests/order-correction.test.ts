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

      const historyResponse = await client.api.v1.history.$get(
        { query: { page: "1", limit: "20" } },
        authenticatedOptions,
      );
      expect(historyResponse.status).toBe(200);
      const history = await historyResponse.json();
      const historyById = new Map(history.data.map((order) => [order.id, order]));
      expect(historyById.get(originalOrderId)).toMatchObject({
        ledgerKind: "corrected-original",
        correctionReason: "Correction automatique de test",
      });
      expect(historyById.get(body.correction.refundOrderId)).toMatchObject({
        ledgerKind: "correction-refund",
        correctionReason: "Correction automatique de test",
      });
      expect(historyById.get(body.correction.replacementOrderId)).toMatchObject({
        ledgerKind: "correction-replacement",
        correctionReason: "Correction automatique de test",
      });

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

  it("rejects a correction that would make the member balance negative", async () => {
    const productId = productIds[0];
    if (!productId) throw new Error("Product missing");
    const originalBalance = await getBalanceByCardNumber(memberCardNumber);
    let originalOrderId: number | null = null;

    try {
      await db
        .update(members)
        .set({ balance: "100.00" })
        .where(eq(members.id, memberId));
      const purchase = await client.api.v1.purchase.$post(
        {
          json: {
            transactionId: crypto.randomUUID(),
            cardNumber: memberCardNumber,
            items: [{ productId, amount: 1 }],
          },
        },
        authenticatedOptions,
      );
      expect(purchase.status).toBe(201);
      const purchaseBody = await purchase.json();
      originalOrderId = purchaseBody.transaction.orderIds[0]!;

      await db
        .update(members)
        .set({ balance: "0.00" })
        .where(eq(members.id, memberId));
      const orderCountBefore = await getOrderCount();
      const response = await client.api.v1["order-corrections"].apply.$post(
        {
          json: {
            adminCardNumber,
            originalOrderId,
            replacementProductId: productId,
            replacementAmount: 2,
            reason: "Test du blocage du solde négatif",
          },
        },
        authenticatedOptions,
      );

      expect(response.status).toBe(402);
      expect(await response.json()).toMatchObject({
        error: "Solde insuffisant pour appliquer cette correction",
      });
      expect(await getBalanceByCardNumber(memberCardNumber)).toBe("0.00");
      expect(await getOrderCount()).toBe(orderCountBefore);
      expect(await orderCorrectionService.findOriginal(originalOrderId)).toBeUndefined();
    } finally {
      if (originalOrderId !== null) {
        await db.delete(orders).where(eq(orders.id, originalOrderId));
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
