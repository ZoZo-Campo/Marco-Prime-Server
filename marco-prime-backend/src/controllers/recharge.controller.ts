import type { Context } from "hono";
import type { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { MemberRepository } from "../repositories/member.repository.js";
import { OrderRepository } from "../repositories/order.repository.js";
import { auditEvent } from "../config/logger.js";
import {
  rechargeReceiptSchema,
  rechargeRequestSchema,
} from "../validators/recharge.validator.js";

type RechargeRequest = z.infer<typeof rechargeRequestSchema>;
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
    const { transactionId, cardNumber, adminCardNumber, amount } = request;
    const requestKey = JSON.stringify({ cardNumber, adminCardNumber, amount });
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

  private async processRecharge({
    transactionId,
    cardNumber,
    adminCardNumber,
    amount,
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
