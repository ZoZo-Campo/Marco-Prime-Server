import type { Context } from "hono";
import type { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { MemberRepository } from "../repositories/member.repository.js";
import { OrderRepository } from "../repositories/order.repository.js";
import { catalogSelectionService } from "../services/catalog-selection.service.js";
import { auditEvent } from "../config/logger.js";
import {
  purchaseReceiptSchema,
  purchaseRequestSchema,
} from "../validators/purchase.validator.js";

type PurchaseRequest = z.infer<typeof purchaseRequestSchema>;
type PurchaseReceiptDTO = z.infer<typeof purchaseReceiptSchema>;

type CachedPurchase = {
  requestKey: string;
  receipt: PurchaseReceiptDTO;
};

const completedPurchases = new Map<string, CachedPurchase>();
const purchasesInProgress = new Map<
  string,
  { requestKey: string; promise: Promise<PurchaseReceiptDTO> }
>();
const MAX_COMPLETED_PURCHASES = 1_000;

export class PurchaseController {
  private memberRepository = new MemberRepository();
  private orderRepository = new OrderRepository();

  async createPurchase(c: Context) {
    const request = c.req.valid(
      "json" as never,
    ) as PurchaseRequest;
    const requestKey = JSON.stringify({
      cardNumber: request.cardNumber,
      items: request.items,
    });
    const completed = completedPurchases.get(request.transactionId);
    if (completed) {
      if (completed.requestKey !== requestKey) {
        throw new HTTPException(409, {
          message: "Cet identifiant de transaction appartient à un autre panier",
        });
      }
      return c.json(completed.receipt, 200);
    }

    let inProgress = purchasesInProgress.get(request.transactionId);
    if (inProgress && inProgress.requestKey !== requestKey) {
      throw new HTTPException(409, {
        message: "Cet identifiant de transaction appartient à un autre panier",
      });
    }
    if (!inProgress) {
      inProgress = {
        requestKey,
        promise: this.processPurchase(request),
      };
      purchasesInProgress.set(request.transactionId, inProgress);
    }

    try {
      const receipt = await inProgress.promise;
      completedPurchases.set(request.transactionId, { requestKey, receipt });
      trimCompletedPurchases();
      return c.json(receipt, 201);
    } finally {
      purchasesInProgress.delete(request.transactionId);
    }
  }

  private async processPurchase({
    transactionId,
    cardNumber,
    items,
  }: PurchaseRequest): Promise<PurchaseReceiptDTO> {

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
      }
      throw error;
    }

    const receipt = {
      success: true,
      transaction: {
        transactionId,
        orderIds: purchase.orderIds,
        date: purchase.orderDate,
        items: purchase.items,
        member: {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          cardNumber: member.cardNumber!,
        },
        totalPrice: purchase.totalPrice,
        previousBalance: purchase.previousBalance,
        newBalance: purchase.newBalance,
      },
    } satisfies PurchaseReceiptDTO;

    auditEvent("purchase.completed", {
      transactionId,
      memberId: member.id,
      orderIds: purchase.orderIds,
      previousBalance: purchase.previousBalance,
      amount: `-${purchase.totalPrice}`,
      newBalance: purchase.newBalance,
    });

    return receipt;
  }
}

function trimCompletedPurchases() {
  while (completedPurchases.size > MAX_COMPLETED_PURCHASES) {
    const oldestTransactionId = completedPurchases.keys().next().value;
    if (!oldestTransactionId) return;
    completedPurchases.delete(oldestTransactionId);
  }
}
