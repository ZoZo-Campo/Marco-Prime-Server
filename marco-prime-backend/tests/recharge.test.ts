import { testClient } from "hono/testing";
import { describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import {
  authenticatedOptions,
  getBalanceByCardNumber,
  getAdminCardNumber,
  getNonAdminCardNumber,
  getOrderById,
  getOrderCount,
} from "./utils/helpers.js";

describe("Recharge Endpoint", async () => {
  const client = testClient(app);
  const adminCardNumber = await getAdminCardNumber();
  const nonAdminCardNumber = await getNonAdminCardNumber();

  it("should create a recharge successfully without admin card", async () => {
    const res = await client.api.v1.recharge.$post(
      {
        json: {
          transactionId: crypto.randomUUID(),
          cardNumber: nonAdminCardNumber,
          adminCardNumber,
          amount: 10.5,
        },
      },
      authenticatedOptions,
    );
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data).toHaveProperty("success", true);
    expect(data).toHaveProperty("transaction");
    expect(data.transaction).toHaveProperty("date");
    expect(data.transaction).toHaveProperty("member");
    expect(data.transaction).toHaveProperty("processedBy");
    expect(data.transaction).toHaveProperty("amount");
    expect(data.transaction).toHaveProperty("previousBalance");
    expect(data.transaction).toHaveProperty("newBalance");

    expect(toCents(data.transaction.newBalance)).toBe(
      toCents(data.transaction.previousBalance) +
        toCents(data.transaction.amount),
    );

    const ledgerOrder = await getOrderById(data.transaction.orderId);
    expect(ledgerOrder.productId).toBeNull();
    expect(ledgerOrder.amount).toBe(1);
    expect(toCents(ledgerOrder.price)).toBe(toCents(data.transaction.amount));
  });

  it("should create a recharge successfully when member is admin", async () => {
    const res = await client.api.v1.recharge.$post(
      {
        json: {
          transactionId: crypto.randomUUID(),
          cardNumber: adminCardNumber,
          amount: 10.5,
        },
      },
      authenticatedOptions,
    );
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data).toHaveProperty("success", true);
    expect(data.transaction).not.toHaveProperty("processedBy");
  });

  it("should return the first receipt without crediting twice on retry", async () => {
    const transactionId = crypto.randomUUID();
    const request = {
      json: {
        transactionId,
        cardNumber: nonAdminCardNumber,
        adminCardNumber,
        amount: 4.25,
      },
    };

    const first = await client.api.v1.recharge.$post(request, authenticatedOptions);
    const balanceAfterFirst = await getBalanceByCardNumber(nonAdminCardNumber);
    const retry = await client.api.v1.recharge.$post(request, authenticatedOptions);
    const balanceAfterRetry = await getBalanceByCardNumber(nonAdminCardNumber);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(await first.json());
    expect(balanceAfterRetry).toBe(balanceAfterFirst);
  });

  it("should coalesce two simultaneous recharge requests", async () => {
    const transactionId = crypto.randomUUID();
    const balanceBefore = await getBalanceByCardNumber(nonAdminCardNumber);
    const orderCountBefore = await getOrderCount();
    const request = {
      json: {
        transactionId,
        cardNumber: nonAdminCardNumber,
        adminCardNumber,
        amount: 3.75,
      },
    };

    const [first, duplicate] = await Promise.all([
      client.api.v1.recharge.$post(request, authenticatedOptions),
      client.api.v1.recharge.$post(request, authenticatedOptions),
    ]);
    const firstReceipt = await first.json();
    const duplicateReceipt = await duplicate.json();

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(201);
    expect(duplicateReceipt).toEqual(firstReceipt);
    expect(await getOrderCount()).toBe(orderCountBefore + 1);
    expect(toCents(await getBalanceByCardNumber(nonAdminCardNumber))).toBe(
      toCents(balanceBefore) + toCents(firstReceipt.transaction.amount),
    );
  });

  it("should reject a reused transaction identifier with different data", async () => {
    const transactionId = crypto.randomUUID();
    const first = await client.api.v1.recharge.$post(
      {
        json: {
          transactionId,
          cardNumber: nonAdminCardNumber,
          adminCardNumber,
          amount: 1,
        },
      },
      authenticatedOptions,
    );
    const conflict = await client.api.v1.recharge.$post(
      {
        json: {
          transactionId,
          cardNumber: nonAdminCardNumber,
          adminCardNumber,
          amount: 2,
        },
      },
      authenticatedOptions,
    );

    expect(first.status).toBe(201);
    expect(conflict.status).toBe(409);
  });

  it("should return 404 for non-existent member", async () => {
    const res = await client.api.v1.recharge.$post(
      {
        json: {
          transactionId: crypto.randomUUID(),
          cardNumber: 999999,
          adminCardNumber,
          amount: 10,
        },
      },
      authenticatedOptions,
    );
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("should return 404 for non-existent admin", async () => {
    const res = await client.api.v1.recharge.$post(
      {
        json: {
          transactionId: crypto.randomUUID(),
          cardNumber: nonAdminCardNumber,
          adminCardNumber: 999999,
          amount: 10,
        },
      },
      authenticatedOptions,
    );
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("should return 403 when non-admin tries to recharge another member", async () => {
    const res = await client.api.v1.recharge.$post(
      {
        json: {
          transactionId: crypto.randomUUID(),
          cardNumber: nonAdminCardNumber,
          adminCardNumber: nonAdminCardNumber,
          amount: 10,
        },
      },
      authenticatedOptions,
    );
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("should return 403 when non-admin member tries to recharge without admin card", async () => {
    const res = await client.api.v1.recharge.$post(
      {
        json: {
          transactionId: crypto.randomUUID(),
          cardNumber: nonAdminCardNumber,
          amount: 10,
        },
      },
      authenticatedOptions,
    );
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("should return 401 without authentication", async () => {
    const res = await client.api.v1.recharge.$post({
      json: {
        transactionId: crypto.randomUUID(),
        cardNumber: nonAdminCardNumber,
        adminCardNumber,
        amount: 10,
      },
    });
    expect(res.status).toBe(401);
  });
});

function toCents(value: string) {
  return Math.round(Number(value) * 100);
}
