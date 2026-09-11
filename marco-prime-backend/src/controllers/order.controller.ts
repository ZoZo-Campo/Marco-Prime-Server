import type { Context } from "hono";
import type { z } from "zod";
import { OrderRepository } from "../repositories/order.repository.js";
import { orderCorrectionService } from "../services/order-correction.service.js";
import { paginationQuerySchema } from "../validators/orders.validator.js";

type OrdersQueryRequest = z.infer<typeof paginationQuerySchema>;

export class OrderController {
  private orderRepository = new OrderRepository();

  async getOrdersHistory(c: Context) {
    const { page, limit } = c.req.valid("query" as never) as OrdersQueryRequest;

    const offset = (page - 1) * limit;
    const [total, ordersList, corrections] = await Promise.all([
      this.orderRepository.countAll(),
      this.orderRepository.findMany(limit, offset),
      orderCorrectionService.all(),
    ]);
    const totalPages = Math.ceil(total / limit);
    const completed = corrections.filter(
      (correction) => correction.status === "completed",
    );
    const correctedOriginals = new Set(
      completed.map((correction) => correction.originalOrderId),
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

    return c.json({
      data: ordersList.map((order) => {
        const refund = refundById.get(order.id);
        const replacement = replacementById.get(order.id);
        return {
          ...order,
          ledgerKind: refund
            ? "correction-refund"
            : replacement
              ? "correction-replacement"
              : correctedOriginals.has(order.id)
                ? "corrected-original"
                : order.product
                  ? "purchase"
                  : "recharge",
          correctionOriginalOrderId:
            refund?.originalOrderId ?? replacement?.originalOrderId ?? null,
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
