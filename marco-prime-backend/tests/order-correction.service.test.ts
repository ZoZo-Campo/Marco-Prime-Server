import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { orderCorrectionService } from "../src/services/order-correction.service.js";

describe("OrderCorrectionService", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "marco-correction-"));
    process.env.MARCO_DATA_DIR = directory;
    orderCorrectionService.resetForTests();
  });

  afterEach(async () => {
    orderCorrectionService.resetForTests();
    await rm(directory, { recursive: true, force: true });
  });

  it("reserves an order before completion and prevents a second correction", async () => {
    const reservation = {
      originalOrderId: 12,
      replacementProductId: 7,
      replacementAmount: 1,
      reason: "Une boisson saisie en trop",
      adminMemberId: 2,
      createdAt: new Date().toISOString(),
    };
    await orderCorrectionService.reserve(reservation);
    await expect(orderCorrectionService.reserve(reservation)).rejects.toThrow(
      "ORDER_ALREADY_CORRECTED",
    );
    expect((await orderCorrectionService.findOriginal(12))?.status).toBe("pending");

    await orderCorrectionService.complete(12, {
      originalOrderId: 12,
      refundOrderId: 13,
      replacementOrderId: 14,
      originalProductId: 6,
      replacementProductId: 7,
      originalAmount: 2,
      replacementAmount: 1,
      refunded: "4.00",
      charged: "2.50",
      balanceChange: "1.50",
      previousBalance: "10.00",
      newBalance: "11.50",
    });
    expect((await orderCorrectionService.findOriginal(12))?.status).toBe("completed");

    orderCorrectionService.resetForTests();
    expect((await orderCorrectionService.findOriginal(12))?.status).toBe("completed");
  });

  it("can release a reservation when MySQL rejects the correction", async () => {
    await orderCorrectionService.reserve({
      originalOrderId: 20,
      replacementProductId: null,
      replacementAmount: 0,
      reason: "Annulation de test",
      adminMemberId: 2,
      createdAt: new Date().toISOString(),
    });
    await orderCorrectionService.removePending(20);
    expect(await orderCorrectionService.findOriginal(20)).toBeUndefined();
  });
});
