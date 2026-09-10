import type { Context } from "hono";
import type { z } from "zod";
import { OrderRepository } from "../repositories/order.repository.js";
import { paginationQuerySchema } from "../validators/orders.validator.js";

type OrdersQueryRequest = z.infer<typeof paginationQuerySchema>;

export class OrderController {
  private orderRepository = new OrderRepository();

  async getOrdersHistory(c: Context) {
    const { page, limit } = c.req.valid("query" as never) as OrdersQueryRequest;

    const offset = (page - 1) * limit;
    const total = await this.orderRepository.countAll();
    const ordersList = await this.orderRepository.findMany(limit, offset);
    const totalPages = Math.ceil(total / limit);

    return c.json({
      data: ordersList,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  }
}
