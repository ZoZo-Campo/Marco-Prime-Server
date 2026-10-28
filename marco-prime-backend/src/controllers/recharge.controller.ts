import type { Context } from "hono";
import type { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { MemberRepository } from "../repositories/member.repository.js";
import { OrderRepository } from "../repositories/order.repository.js";
import { auditEvent } from "../config/logger.js";
import { recordRechargeMethod } from "../services/recharge-method.service.js";
import { rechargeCorrectionService } from "../services/recharge-correction.service.js";
import { orderCorrectionService } from "../services/order-correction.service.js";
import {
  rechargeCorrectionSchema,
  rechargeMethodUpdateSchema,
  rechargeReceiptSchema,
  rechargeRequestSchema,
} from "../validators/recharge.validator.js";

type RechargeRequest = z.infer<typeof rechargeRequestSchema>;
type RechargeMethodUpdateRequest = z.infer<typeof rechargeMethodUpdateSchema>;
type RechargeCorrectionRequest = z.infer<typeof rechargeCorrectionSchema>;
type RechargeReceiptDTO = z.infer<typeof rechargeReceiptSchema>;

type CachedRecharge = {
  requestKey: string;
  receipt: RechargeReceiptDTO;
};

const completedRecharges = new Map<string, CachedRecharge>();
const rechargesInProgress = new Map<
  string,
  { requestKey: string; promise: Promise<RechargeReceiptDTO> }
>();
const MAX_COMPLETED_RECHARGES = 1_000;

export class RechargeController {
  private memberRepository = new MemberRepository();
  private orderRepository = new OrderRepository();

  async createRecharge(c: Context) {
    const request = c.req.valid(
      "json" as never,
    ) as RechargeRequest;
    const { transactionId, cardNumber, adminCardNumber, amount, paymentMethod } = request;
    const requestKey = JSON.stringify({ cardNumber, adminCardNumber, amount, paymentMethod });
    const completed = completedRecharges.get(transactionId);

    if (completed) {
      if (completed.requestKey !== requestKey) {
        throw new HTTPException(409, {
          message: "Cet identifiant de transaction appartient à un autre rechargement",
        });
      }
      return c.json(completed.receipt, 200);
    }

    let inProgress = rechargesInProgress.get(transactionId);
    if (inProgress && inProgress.requestKey !== requestKey) {
      throw new HTTPException(409, {
        message: "Cet identifiant de transaction appartient à un autre rechargement",
      });
    }
    if (!inProgress) {
      inProgress = {
        requestKey,
        promise: this.processRecharge(request),
      };
      rechargesInProgress.set(transactionId, inProgress);
    }

    try {
      const receipt = await inProgress.promise;
      completedRecharges.set(transactionId, { requestKey, receipt });
      trimCompletedRecharges();
      return c.json(receipt, 201);
    } finally {
      rechargesInProgress.delete(transactionId);
    }
  }

  async updateMethod(c: Context) {
    const request = c.req.valid("json" as never) as RechargeMethodUpdateRequest;
    const admin = await this.requireAdmin(request.adminCardNumber);
    const recharge = await this.orderRepository.findRechargeById(request.orderId);
    if (!recharge) {
      throw new HTTPException(404, { message: "Rechargement introuvable" });
    }
    if (
      recharge.productId !== null ||
      recharge.amount !== 1 ||
      Number(recharge.price) <= 0 ||
      (await this.isPurchaseCorrectionOrder(recharge.id))
    ) {
      throw new HTTPException(400, {
        message: "Cette écriture n’est pas un rechargement",
      });
    }

    try {
      await recordRechargeMethod(recharge.id, request.paymentMethod, {
        cardNumber: recharge.memberCardNumber ?? undefined,
        firstName: recharge.memberFirstName ?? undefined,
        lastName: recharge.memberLastName ?? undefined,
        amount: Number(recharge.price).toFixed(2),
        orderDate: new Date(recharge.date).toISOString(),
      });
    } catch (error) {
      throw new HTTPException(503, {
        message: "Impossible d’enregistrer le mode de paiement local",
        cause: error,
      });
    }

    auditEvent("recharge.method_updated", {
      adminMemberId: admin.id,
      orderId: recharge.id,
      paymentMethod: request.paymentMethod,
    });
    return c.json({ success: true, paymentMethod: request.paymentMethod });
  }

  async cancel(c: Context) {
    const request = c.req.valid("json" as never) as RechargeCorrectionRequest;
    const admin = await this.requireAdmin(request.adminCardNumber);
    if (await this.isPurchaseCorrectionOrder(request.originalOrderId)) {
      throw new HTTPException(400, {
        message: "Cette écriture n’est pas un rechargement",
      });
    }

    try {
      await rechargeCorrectionService.reserve({
        originalOrderId: request.originalOrderId,
        adminMemberId: admin.id,
        reason: request.reason,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "RECHARGE_ALREADY_CORRECTED"
      ) {
        throw new HTTPException(409, {
          message: "Ce rechargement est déjà annulé ou en cours d’annulation",
        });
      }
      throw error;
    }

    let result;
    try {
      result = await this.orderRepository.cancelRechargeTransaction(
        request.originalOrderId,
      );
    } catch (error) {
      await rechargeCorrectionService.removePending(request.originalOrderId);
      const message = error instanceof Error ? error.message : "";
      if (message === "RECHARGE_CORRECTION_NOT_FOUND") {
        throw new HTTPException(404, { message: "Rechargement introuvable" });
      }
      if (message === "RECHARGE_CORRECTION_INSUFFICIENT_BALANCE") {
        throw new HTTPException(402, {
          message:
            "Solde insuffisant : le membre a déjà dépensé une partie de ce rechargement",
        });
      }
      if (message.startsWith("RECHARGE_CORRECTION_")) {
        throw new HTTPException(400, {
          message: "Ce rechargement ne peut pas être annulé",
        });
      }
      throw new HTTPException(503, {
        message:
          "Résultat incertain : vérifiez l’historique avant toute nouvelle tentative",
        cause: error,
      });
    }

    try {
      await rechargeCorrectionService.complete(request.originalOrderId, result);
    } catch (error) {
      throw new HTTPException(503, {
        message:
          "Rechargement annulé, mais journal local non confirmé : ne recommencez pas",
        cause: error,
      });
    }

    auditEvent("recharge.cancelled", {
      adminMemberId: admin.id,
      reason: request.reason,
      ...result,
    });
    return c.json({ success: true, correction: result }, 201);
  }

  private async isPurchaseCorrectionOrder(orderId: number) {
    const corrections = await orderCorrectionService.all();
    return corrections.some(
      (correction) =>
        correction.status === "completed" &&
        (correction.refundOrderId === orderId ||
          correction.replacementOrderId === orderId),
    );
  }

  private async requireAdmin(cardNumber: number) {
    const member = await this.memberRepository.findFullByCardNumber(cardNumber);
    if (!member?.admin) {
      throw new HTTPException(403, {
        message: "Une carte administrateur est requise",
      });
    }
    return member;
  }

  private async processRecharge({
    transactionId,
    cardNumber,
    adminCardNumber,
    amount,
    paymentMethod,
  }: RechargeRequest): Promise<RechargeReceiptDTO> {

    const member = await this.memberRepository.findFullByCardNumber(cardNumber);
    if (!member) {
      throw new HTTPException(404, {
        message: "Carte membre inconnue",
      });
    }

    let adminMember = null;

    if (!member.admin) {
      if (!adminCardNumber) {
        throw new HTTPException(403, {
          message: "Admin card number required for non-admin member recharge",
        });
      }

      const admin =
        await this.memberRepository.findFullByCardNumber(adminCardNumber);
      if (!admin) {
        throw new HTTPException(404, {
          message: "Carte administrateur inconnue",
        });
      }

      if (!admin.admin) {
        throw new HTTPException(403, {
          message: "Provided card number is not an admin",
        });
      }

      adminMember = admin;
    }

    const rechargeAmount = parseFloat(amount.toFixed(2));
    const recharge = await this.orderRepository.createRechargeTransaction(
      member.id,
      rechargeAmount,
    );

    // The balance is already committed. Never report a failed recharge solely
    // because the local payment-method annotation could not be saved.
    let paymentMethodRecorded = true;
    try {
      await recordRechargeMethod(recharge.orderId, paymentMethod, {
        cardNumber: member.cardNumber ?? undefined,
        firstName: member.firstName,
        lastName: member.lastName,
        amount: rechargeAmount.toFixed(2),
        orderDate: new Date(recharge.orderDate).toISOString(),
      });
    } catch (error) {
      paymentMethodRecorded = false;
      console.error("Recharge enregistrée, mode de paiement non sauvegardé", error);
    }

    const receipt = {
      success: true,
      transaction: {
        transactionId,
        orderId: recharge.orderId,
        date: recharge.orderDate,
        member: {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          cardNumber: member.cardNumber!,
        },
        processedBy: adminMember
          ? {
              id: adminMember.id,
              firstName: adminMember.firstName,
              lastName: adminMember.lastName,
              cardNumber: adminMember.cardNumber!,
              isAdmin: adminMember.admin,
            }
          : undefined,
        amount: rechargeAmount.toFixed(2),
        previousBalance: recharge.previousBalance,
        newBalance: recharge.newBalance,
        paymentMethod,
        paymentMethodRecorded,
      },
    } satisfies RechargeReceiptDTO;

    auditEvent("recharge.completed", {
      transactionId,
      memberId: member.id,
      orderId: recharge.orderId,
      previousBalance: recharge.previousBalance,
      amount: rechargeAmount.toFixed(2),
      newBalance: recharge.newBalance,
      processedByMemberId: adminMember?.id ?? member.id,
    });

    return receipt;
  }
}

function trimCompletedRecharges() {
  while (completedRecharges.size > MAX_COMPLETED_RECHARGES) {
    const oldestTransactionId = completedRecharges.keys().next().value;
    if (!oldestTransactionId) return;
    completedRecharges.delete(oldestTransactionId);
  }
}
