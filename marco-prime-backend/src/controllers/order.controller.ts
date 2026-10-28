import type { Context } from "hono";
import type { z } from "zod";
import { OrderRepository } from "../repositories/order.repository.js";
import { orderCorrectionService } from "../services/order-correction.service.js";
import { rechargeCorrectionService } from "../services/recharge-correction.service.js";
import { readRechargeMethods } from "../services/recharge-method.service.js";
import { historyQuerySchema } from "../validators/orders.validator.js";

type OrdersQueryRequest = z.infer<typeof historyQuerySchema>;

export class OrderController {
  private orderRepository = new OrderRepository();

  async getOrdersHistory(c: Context) {
    const { page, limit, search, from, to } = c.req.valid(
      "query" as never,
    ) as OrdersQueryRequest;

    const offset = (page - 1) * limit;
    const filters = {
      ...(search ? { search } : {}),
      ...(from ? { from: new Date(from) } : {}),
      ...(to ? { to: new Date(to) } : {}),
    };
    const [total, ordersList, corrections, rechargeCorrections, rechargeMethods] =
      await Promise.all([
        this.orderRepository.countAll(filters),
        this.orderRepository.findMany(limit, offset, filters),
        orderCorrectionService.all(),
        rechargeCorrectionService.all(),
        readRechargeMethods(),
      ]);
    const memberIds = [
      ...new Set(
        ordersList.flatMap((order) =>
          order.member === null ? [] : [order.member.id],
        ),
      ),
    ];
    const ledger = await this.orderRepository.findLedgerByMemberIds(memberIds);
    const balances = calculateBalances(ordersList, ledger);
    const totalPages = Math.ceil(total / limit);
    const completed = corrections.filter(
      (correction) => correction.status === "completed",
    );
    const correctedOriginals = new Set(
      completed.map((correction) => correction.originalOrderId),
    );
    const originalById = new Map(
      completed.map((correction) => [correction.originalOrderId, correction]),
    );
    const refundById = new Map(
      completed.map((correction) => [correction.refundOrderId, correction]),
    );
    const replacementById = new Map(
      completed.flatMap((correction) =>
        correction.replacementOrderId === null
          ? []
          : [[correction.replacementOrderId, correction] as const],
      ),
    );
    const completedRechargeCorrections = rechargeCorrections.filter(
      (correction) => correction.status === "completed",
    );
    const rechargeOriginalById = new Map(
      completedRechargeCorrections.map((correction) => [
        correction.originalOrderId,
        correction,
      ]),
    );
    const rechargeCancellationById = new Map(
      completedRechargeCorrections.map((correction) => [
        correction.cancellationOrderId,
        correction,
      ]),
    );

    return c.json({
      data: ordersList.map((order) => {
        const refund = refundById.get(order.id);
        const replacement = replacementById.get(order.id);
        const original = originalById.get(order.id);
        const rechargeOriginal = rechargeOriginalById.get(order.id);
        const rechargeCancellation = rechargeCancellationById.get(order.id);
        const correction =
          original ?? refund ?? replacement ?? rechargeOriginal ?? rechargeCancellation;
        return {
          ...order,
          effectivePrice: normalizeLedgerPrice(
            order.product?.id ?? null,
            order.price,
            order.amount,
          ),
          previousBalance: balances.get(order.id)?.previousBalance ?? null,
          newBalance: balances.get(order.id)?.newBalance ?? null,
          ledgerKind: rechargeCancellation
            ? "recharge-correction"
            : rechargeOriginal
              ? "recharge-corrected"
              : refund
                ? "correction-refund"
                : replacement
                  ? "correction-replacement"
                  : correctedOriginals.has(order.id)
                    ? "corrected-original"
                    : order.product
                      ? "purchase"
                      : "recharge",
          correctionOriginalOrderId:
            refund?.originalOrderId ??
            replacement?.originalOrderId ??
            rechargeOriginal?.originalOrderId ??
            rechargeCancellation?.originalOrderId ??
            null,
          correctionReason: correction?.reason ?? null,
          paymentMethod:
            order.product === null
              ? (rechargeMethods[String(order.id)] ?? null)
              : null,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  }
}

function calculateBalances(
  displayedOrders: Array<{
    id: number;
    member: { id: number; balance: string } | null;
  }>,
  ledger: Array<{
    id: number;
    memberId: number | null;
    productId: number | null;
    price: string;
    amount: number;
  }>,
) {
  const targets = new Set(displayedOrders.map((order) => order.id));
  const running = new Map<number, number>();
  for (const order of displayedOrders) {
    if (!order.member || running.has(order.member.id)) continue;
    const balance = toCents(order.member.balance);
    if (balance !== null) running.set(order.member.id, balance);
  }

  const result = new Map<
    number,
    { previousBalance: string; newBalance: string }
  >();
  for (const order of ledger) {
    if (order.memberId === null) continue;
    const newBalance = running.get(order.memberId);
    if (newBalance === undefined) continue;
    const delta = normalizedLedgerCents(
      order.productId,
      order.price,
      order.amount,
    );
    if (delta === null) continue;
    const previousBalance = newBalance - delta;
    if (targets.has(order.id)) {
      result.set(order.id, {
        previousBalance: fromCents(previousBalance),
        newBalance: fromCents(newBalance),
      });
    }
    running.set(order.memberId, previousBalance);
  }
  return result;
}

function normalizeLedgerPrice(
  productId: number | null,
  price: string,
  amount: number,
) {
  const cents = normalizedLedgerCents(productId, price, amount);
  return cents === null ? price : fromCents(cents);
}

function normalizedLedgerCents(
  productId: number | null,
  price: string,
  amount: number,
) {
  const cents = toCents(price);
  if (cents === null) return null;
  if (productId !== null && cents >= 0) {
    const total = -cents * amount;
    return Number.isSafeInteger(total) ? total : null;
  }
  return cents;
}

function toCents(value: string) {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function fromCents(value: number) {
  return (value / 100).toFixed(2);
}
