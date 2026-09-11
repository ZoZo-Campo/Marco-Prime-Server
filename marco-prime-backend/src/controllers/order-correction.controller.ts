import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { auditEvent } from "../config/logger.js";
import { MemberRepository } from "../repositories/member.repository.js";
import { OrderRepository } from "../repositories/order.repository.js";
import { orderCorrectionService } from "../services/order-correction.service.js";
import type { correctionListSchema, correctionRequestSchema } from "../validators/order-correction.validator.js";

type ListRequest = z.infer<typeof correctionListSchema>;
type CorrectionRequest = z.infer<typeof correctionRequestSchema>;

export class OrderCorrectionController {
  private members = new MemberRepository();
  private orders = new OrderRepository();

  async list(c: Context) {
    const request = c.req.valid("json" as never) as ListRequest;
    await this.requireAdmin(request.adminCardNumber);
    const [orders, corrections] = await Promise.all([
      this.orders.findMany(request.limit, 0),
      orderCorrectionService.all(),
    ]);
    const corrected = new Map(corrections.map((record) => [record.originalOrderId, record]));
    return c.json(orders.filter((order) => order.product && Number(order.price) < 0).map((order) => ({
      ...order,
      correction: corrected.get(order.id) ?? null,
    })));
  }

  async apply(c: Context) {
    const request = c.req.valid("json" as never) as CorrectionRequest;
    const admin = await this.requireAdmin(request.adminCardNumber);
    let result;
    const reservation = {
      originalOrderId: request.originalOrderId,
      replacementProductId: request.replacementProductId,
      replacementAmount: request.replacementAmount,
      reason: request.reason,
      adminMemberId: admin.id,
      createdAt: new Date().toISOString(),
    };
    try {
      // Persist before touching MySQL. A crash can therefore leave an explicit
      // "pending" correction, but can never silently authorize a second refund.
      await orderCorrectionService.reserve(reservation);
    } catch (error) {
      if (error instanceof Error && error.message === "ORDER_ALREADY_CORRECTED") {
        throw new HTTPException(409, {
          message: "Cette vente est déjà corrigée ou attend une vérification",
        });
      }
      throw error;
    }

    try {
      result = await this.orders.correctPurchaseTransaction(
        request.originalOrderId,
        request.replacementProductId,
        request.replacementAmount,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("CORRECTION_")) {
        await orderCorrectionService.removePending(request.originalOrderId);
        throw new HTTPException(400, { message: "Cette vente ne peut pas être corrigée" });
      }
      throw new HTTPException(503, {
        message:
          "Résultat incertain : vérifiez la vente avant toute nouvelle tentative",
        cause: error,
      });
    }

    try {
      await orderCorrectionService.complete(request.originalOrderId, result);
    } catch (error) {
      throw new HTTPException(503, {
        message:
          "Correction effectuée, mais journal local non confirmé : ne recommencez pas",
        cause: error,
      });
    }

    auditEvent("purchase.corrected", {
      adminMemberId: admin.id,
      reason: request.reason,
      ...result,
    });
    return c.json({ success: true, correction: result }, 201);
  }

  private async requireAdmin(cardNumber: number) {
    const member = await this.members.findFullByCardNumber(cardNumber);
    if (!member?.admin) throw new HTTPException(403, { message: "An administrator card is required" });
    return member;
  }
}
