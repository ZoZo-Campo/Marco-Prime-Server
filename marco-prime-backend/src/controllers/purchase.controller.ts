import type { Context } from "hono";
import type { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { MemberRepository } from "../repositories/member.repository.js";
import {
  OrderRepository,
  type PurchaseTransactionResult,
} from "../repositories/order.repository.js";
import { catalogSelectionService } from "../services/catalog-selection.service.js";
import {
  findIdempotentResponse,
  hashRequest,
  IdempotencyConflictError,
} from "../services/idempotency.service.js";
import { auditEvent } from "../config/logger.js";
import {
  purchaseReceiptSchema,
  purchaseRequestSchema,
} from "../validators/purchase.validator.js";

type PurchaseRequest = z.infer<typeof purchaseRequestSchema>;
type PurchaseReceiptDTO = z.infer<typeof purchaseReceiptSchema>;

type InFlightPurchase = {
  requestKey: string;
  promise: Promise<PurchaseReceiptDTO>;
};

// Uniquement pour fusionner deux requêtes simultanées dans le même processus.
// La source de vérité est la table `idempotency_keys`, pas cette Map.
const purchasesInProgress = new Map<string, InFlightPurchase>();

export class PurchaseController {
  private memberRepository = new MemberRepository();
  private orderRepository = new OrderRepository();

  async createPurchase(c: Context) {
    const request = c.req.valid("json" as never) as PurchaseRequest;
    const requestKey = hashRequest("purchase", {
      cardNumber: request.cardNumber,
      items: request.items,
    });

    const inFlight = purchasesInProgress.get(request.transactionId);
    if (inFlight) {
      if (inFlight.requestKey !== requestKey) {
        throw new HTTPException(409, {
          message: "Cet identifiant de transaction appartient à un autre panier",
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

    const cached = await this.readCached(
      request.transactionId,
      requestKey,
    );
    if (cached) return c.json(cached, 200);

    // Nouvelle vérification après l'attente réseau/DB : deux requêtes
    // parties en même temps ne doivent pas créer deux transactions.
    const racing = purchasesInProgress.get(request.transactionId);
    if (racing) {
      if (racing.requestKey !== requestKey) {
        throw new HTTPException(409, {
          message: "Cet identifiant de transaction appartient à un autre panier",
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

    const promise = this.processPurchase(request, requestKey);
    purchasesInProgress.set(request.transactionId, { requestKey, promise });
    try {
      const receipt = await this.resolveReceipt(
        promise,
        request.transactionId,
        requestKey,
      );
      return c.json(receipt, 201);
    } finally {
      purchasesInProgress.delete(request.transactionId);
    }
  }

  /**
   * Si une autre instance de l'API a gagné la course, l'insertion de la clé
   * échoue. On relit alors la réponse validée en base et on la rejoue.
   */
  private async resolveReceipt(
    promise: Promise<PurchaseReceiptDTO>,
    transactionId: string,
    requestKey: string,
  ): Promise<PurchaseReceiptDTO> {
    try {
      return await promise;
    } catch (error) {
      try {
        const cached = await this.readCached(transactionId, requestKey);
        if (cached) return cached;
      } catch (lookupError) {
        // Un identifiant réutilisé avec un autre panier est un conflit
        // explicite ; une panne de lecture ne doit pas masquer l'erreur
        // d'origine (solde insuffisant, produit indisponible…).
        if (lookupError instanceof HTTPException) throw lookupError;
      }
      throw error;
    }
  }

  private async readCached(transactionId: string, requestKey: string) {
    try {
      const cached = await findIdempotentResponse(
        transactionId,
        "purchase",
        requestKey,
      );
      return cached ? (cached as PurchaseReceiptDTO) : null;
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        throw new HTTPException(409, {
          message: "Cet identifiant de transaction appartient à un autre panier",
        });
      }
      throw error;
    }
  }

  private async processPurchase(
    { transactionId, cardNumber, items }: PurchaseRequest,
    requestKey: string,
  ): Promise<PurchaseReceiptDTO> {
    const member = await this.memberRepository.findFullByCardNumber(cardNumber);
    if (!member) {
      throw new HTTPException(404, {
        message: "Carte membre inconnue",
      });
    }

    let purchase;
    try {
      const selectedProductIds =
        await catalogSelectionService.getSelectedProductIds();
      purchase = await this.orderRepository.createCartPurchaseTransaction(
        member.id,
        items,
        selectedProductIds,
        {
          transactionId,
          requestHash: requestKey,
          buildResponse: (result: PurchaseTransactionResult) =>
            ({
              success: true,
              transaction: {
                transactionId,
                orderIds: result.orderIds,
                date: result.orderDate,
                items: result.items,
                member: {
                  id: member.id,
                  firstName: member.firstName,
                  lastName: member.lastName,
                  cardNumber: member.cardNumber!,
                },
                totalPrice: result.totalPrice,
                previousBalance: result.previousBalance,
                newBalance: result.newBalance,
              },
            }) satisfies PurchaseReceiptDTO,
        },
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.startsWith("PRODUCT_NOT_FOUND:")) {
          throw new HTTPException(404, { message: "Product not found" });
        }
        if (
          error.message.startsWith("PRODUCT_UNAVAILABLE:") ||
          error.message.startsWith("PRODUCT_NOT_SELECTED:")
        ) {
          throw new HTTPException(400, {
            message: "A product is no longer available on this Marco",
          });
        }
        if (
          error.message.startsWith("INVALID_PRODUCT_PRICE:") ||
          error.message === "INVALID_PURCHASE_TOTAL"
        ) {
          throw new HTTPException(400, {
            message: "Un produit possède un prix invalide",
          });
        }
        if (error.message === "INSUFFICIENT_BALANCE") {
          throw new HTTPException(402, {
            message: "Solde insuffisant : le paiement a été refusé",
          });
        }
      }
      throw error;
    }

    const { result, response } = purchase;
    const receipt = response as PurchaseReceiptDTO;

    auditEvent("purchase.completed", {
      transactionId,
      memberId: member.id,
      orderIds: result.orderIds,
      previousBalance: result.previousBalance,
      amount: `-${result.totalPrice}`,
      newBalance: result.newBalance,
    });

    return receipt;
  }
}
