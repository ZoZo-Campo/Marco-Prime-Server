import type { Context } from "hono";
import type { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { MemberRepository } from "../repositories/member.repository.js";
import {
  OrderRepository,
  type RechargeTransactionResult,
} from "../repositories/order.repository.js";
import { auditEvent } from "../config/logger.js";
import { adminSessionRequired } from "../config/deployment.js";
import { recordRechargeMethod } from "../services/recharge-method.service.js";
import { rechargeCorrectionService } from "../services/recharge-correction.service.js";
import { orderCorrectionService } from "../services/order-correction.service.js";
import { configAuthService } from "../services/config-auth.service.js";
import { verifyAdminSession } from "../services/admin-session.service.js";
import {
  findIdempotentResponse,
  hashRequest,
  IdempotencyConflictError,
  updateIdempotentResponse,
} from "../services/idempotency.service.js";
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

type InFlightRecharge = {
  requestKey: string;
  promise: Promise<RechargeReceiptDTO>;
};

// Uniquement pour fusionner deux requêtes simultanées dans le même processus.
// La source de vérité est la table `idempotency_keys`, pas cette Map.
const rechargesInProgress = new Map<string, InFlightRecharge>();

export class RechargeController {
  private memberRepository = new MemberRepository();
  private orderRepository = new OrderRepository();

  async createRecharge(c: Context) {
    const request = c.req.valid("json" as never) as RechargeRequest;
    const requestKey = hashRequest("recharge", {
      cardNumber: request.cardNumber,
      adminCardNumber: request.adminCardNumber,
      amount: request.amount,
      paymentMethod: request.paymentMethod,
    });

    const inFlight = rechargesInProgress.get(request.transactionId);
    if (inFlight) {
      if (inFlight.requestKey !== requestKey) {
        throw new HTTPException(409, {
          message: "Cet identifiant de transaction appartient à un autre rechargement",
        });
      }
      return c.json(
        await this.resolveReceipt(
          inFlight.promise,
          request.transactionId,
          requestKey,
        ),
        201,
      );
    }

    const cached = await this.readCached(request.transactionId, requestKey);
    if (cached) return c.json(cached, 200);

    const racing = rechargesInProgress.get(request.transactionId);
    if (racing) {
      if (racing.requestKey !== requestKey) {
        throw new HTTPException(409, {
          message: "Cet identifiant de transaction appartient à un autre rechargement",
        });
      }
      return c.json(
        await this.resolveReceipt(
          racing.promise,
          request.transactionId,
          requestKey,
        ),
        201,
      );
    }

    const promise = this.processRecharge(c, request, requestKey);
    rechargesInProgress.set(request.transactionId, { requestKey, promise });
    try {
      const receipt = await this.resolveReceipt(
        promise,
        request.transactionId,
        requestKey,
      );
      return c.json(receipt, 201);
    } finally {
      rechargesInProgress.delete(request.transactionId);
    }
  }

  private async resolveReceipt(
    promise: Promise<RechargeReceiptDTO>,
    transactionId: string,
    requestKey: string,
  ): Promise<RechargeReceiptDTO> {
    try {
      return await promise;
    } catch (error) {
      try {
        const cached = await this.readCached(transactionId, requestKey);
        if (cached) return cached;
      } catch (lookupError) {
        if (lookupError instanceof HTTPException) throw lookupError;
      }
      throw error;
    }
  }

  private async readCached(transactionId: string, requestKey: string) {
    try {
      const cached = await findIdempotentResponse(
        transactionId,
        "recharge",
        requestKey,
      );
      return cached ? (cached as RechargeReceiptDTO) : null;
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        throw new HTTPException(409, {
          message: "Cet identifiant de transaction appartient à un autre rechargement",
        });
      }
      throw error;
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
        { adminMemberId: admin.id, reason: request.reason },
      );
    } catch (error) {
      await rechargeCorrectionService.removePending(request.originalOrderId);
      const message = error instanceof Error ? error.message : "";
      if (message === "RECHARGE_ALREADY_APPLIED") {
        throw new HTTPException(409, {
          message: "Ce rechargement a déjà été annulé",
        });
      }
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
    const inJournal = corrections.some(
      (correction) =>
        correction.status === "completed" &&
        (correction.refundOrderId === orderId ||
          correction.replacementOrderId === orderId),
    );
    if (inJournal) return true;
    // Le journal JSON peut avoir été perdu ; la table de correction reste
    // la référence pour ne pas annuler un remboursement comme un recharge.
    return this.orderRepository.isCorrectionLedgerOrder(orderId);
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

  /**
   * Le parcours de rechargement reste inchangé : la carte admin autorise
   * l'opération. En mode serveur, cette carte doit en plus être couverte par
   * une session signée, obtenue avec le mot de passe de configuration.
   */
  private async assertRechargeAdminSession(c: Context, cardNumber: number) {
    if (!adminSessionRequired()) return;
    const status = await configAuthService.status();
    // Premier démarrage : aucun mot de passe n'existe encore. L'interface
    // invite l'administrateur à en définir un ; on ne bloque pas la caisse
    // avant cette étape.
    if (!status.configured) return;
    const session = verifyAdminSession(c.req.header("x-admin-token"));
    if (!session) {
      throw new HTTPException(401, {
        message:
          "Session administrateur requise : saisissez le mot de passe de configuration",
      });
    }
    if (session.cardNumber !== cardNumber) {
      throw new HTTPException(403, {
        message:
          "La session administrateur ne correspond pas à la carte présentée",
      });
    }
  }

  private async processRecharge(
    c: Context,
    {
      transactionId,
      cardNumber,
      adminCardNumber,
      amount,
      paymentMethod,
    }: RechargeRequest,
    requestKey: string,
  ): Promise<RechargeReceiptDTO> {
    const member = await this.memberRepository.findFullByCardNumber(cardNumber);
    if (!member) {
      throw new HTTPException(404, {
        message: "Carte membre inconnue",
      });
    }

    const authorizingCard =
      adminCardNumber ?? (member.admin ? member.cardNumber! : null);
    if (!authorizingCard) {
      throw new HTTPException(403, {
        message: "Admin card number required for non-admin member recharge",
      });
    }

    let adminMember = null;
    if (adminCardNumber) {
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

    await this.assertRechargeAdminSession(c, authorizingCard);

    const rechargeAmount = parseFloat(amount.toFixed(2));
    const recharge = await this.orderRepository.createRechargeTransaction(
      member.id,
      rechargeAmount,
      {
        transactionId,
        requestHash: requestKey,
        buildResponse: (result: RechargeTransactionResult) =>
          ({
            success: true,
            transaction: {
              transactionId,
              orderId: result.orderId,
              date: result.orderDate,
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
              previousBalance: result.previousBalance,
              newBalance: result.newBalance,
              paymentMethod,
              paymentMethodRecorded: true,
            },
          }) satisfies RechargeReceiptDTO,
      },
    );

    const { result, response } = recharge;
    let receipt = response as RechargeReceiptDTO;

    // Le solde est déjà validé. Une erreur d'annotation locale ne doit jamais
    // faire croire que le rechargement a échoué ni provoquer un second crédit.
    let paymentMethodRecorded = true;
    try {
      await recordRechargeMethod(result.orderId, paymentMethod, {
        cardNumber: member.cardNumber ?? undefined,
        firstName: member.firstName,
        lastName: member.lastName,
        amount: rechargeAmount.toFixed(2),
        orderDate: new Date(result.orderDate).toISOString(),
      });
    } catch (error) {
      paymentMethodRecorded = false;
      console.error("Recharge enregistrée, mode de paiement non sauvegardé", error);
    }

    if (!paymentMethodRecorded) {
      receipt = {
        ...receipt,
        transaction: { ...receipt.transaction, paymentMethodRecorded: false },
      };
      // La réponse mémorisée doit refléter l'état réel pour les rejeux.
      await updateIdempotentResponse(
        transactionId,
        "recharge",
        receipt,
      ).catch((error) => {
        console.error("Réponse de rechargement non mise à jour", error);
      });
    }

    auditEvent("recharge.completed", {
      transactionId,
      memberId: member.id,
      orderId: result.orderId,
      previousBalance: result.previousBalance,
      amount: rechargeAmount.toFixed(2),
      newBalance: result.newBalance,
      processedByMemberId: adminMember?.id ?? member.id,
    });

    return receipt;
  }
}
