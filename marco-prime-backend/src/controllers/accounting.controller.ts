import type { Context } from "hono";
import type { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { MemberRepository } from "../repositories/member.repository.js";
import { accountingService, accountingView } from "../services/accounting.service.js";
import { auditEvent } from "../config/logger.js";
import { StatisticsRepository } from "../repositories/statistics.repository.js";
import { orderCorrectionService } from "../services/order-correction.service.js";
import { readRechargeMethods } from "../services/recharge-method.service.js";
import { rechargeCorrectionService } from "../services/recharge-correction.service.js";
import type {
  accountingExportSchema,
  accountingReadSchema,
  accountingUpdateSchema,
} from "../validators/accounting.validator.js";

type ReadRequest = z.infer<typeof accountingReadSchema>;
type UpdateRequest = z.infer<typeof accountingUpdateSchema>;
type ExportRequest = z.infer<typeof accountingExportSchema>;

export class AccountingController {
  private members = new MemberRepository();
  private statistics = new StatisticsRepository();

  async get(c: Context) {
    const request = c.req.valid("json" as never) as ReadRequest;
    await this.requireAdmin(request.adminCardNumber);
    return c.json(accountingView(await accountingService.get()));
  }

  async update(c: Context) {
    const request = c.req.valid("json" as never) as UpdateRequest;
    const admin = await this.requireAdmin(request.adminCardNumber);
    const products = await this.statistics.findProducts();
    const productNames = new Map(
      products.map((product) => [product.id, product.name]),
    );
    if (request.rows.some((row) => !productNames.has(row.productId))) {
      throw new HTTPException(400, { message: "Unknown accounting product" });
    }
    const saved = await accountingService.replace({
      ...request,
      rows: request.rows.map((row) => ({
        ...row,
        label: productNames.get(row.productId)!,
      })),
    });
    auditEvent("accounting.updated", { adminMemberId: admin.id, rows: saved.rows.length, eventDate: saved.eventDate });
    return c.json(accountingView(saved));
  }

  async export(c: Context) {
    const request = c.req.valid("json" as never) as ExportRequest;
    await this.requireAdmin(request.adminCardNumber);
    const from = new Date(request.from);
    const to = new Date(request.to);
    const [
      accounting,
      sales,
      recharges,
      corrections,
      rechargeCorrections,
      products,
      rechargeMethods,
    ] = await Promise.all([
      accountingService.get(),
      this.statistics.findSales(from, to),
      this.statistics.findRecharges(from, to),
      orderCorrectionService.all(),
      rechargeCorrectionService.all(),
      this.statistics.findProducts(),
      readRechargeMethods(),
    ]);
    const productNames = new Map(
      products.map((product) => [product.id, product.name]),
    );
    const saleProducts = new Map(
      sales.map((sale) => [sale.id, sale.productName]),
    );
    const completed = corrections.filter(
      (correction) => correction.status === "completed",
    );
    const correctedOriginals = new Set(
      completed.map((correction) => correction.originalOrderId),
    );
    const replacementIds = new Set(
      completed.flatMap((correction) =>
        correction.replacementOrderId === null
          ? []
          : [correction.replacementOrderId],
      ),
    );
    const refundIds = new Set(
      completed.map((correction) => correction.refundOrderId),
    );
    const rangeOrderIds = new Set([
      ...sales.map((sale) => sale.id),
      ...recharges.map((recharge) => recharge.id),
    ]);
    const completedRechargeCorrections = rechargeCorrections.filter(
      (correction) => correction.status === "completed",
    );
    const cancelledRechargeIds = new Set(
      completedRechargeCorrections.map((correction) => correction.originalOrderId),
    );
    const rechargeCancellationIds = new Set(
      completedRechargeCorrections.map((correction) => correction.cancellationOrderId),
    );

    // Registre local fusionné avec la base : le mode de paiement n'existe que
    // pour les rechargements faits sur cette Marco. Les autres (réalisés sur une
    // autre caisse) restent sans mode : ils seront signalés « Pas rechargé sur
    // cette Marco » côté interface.
    const rechargeList = recharges
      .filter(
        (recharge) =>
          !refundIds.has(recharge.id) &&
          !cancelledRechargeIds.has(recharge.id) &&
          !rechargeCancellationIds.has(recharge.id),
      )
      .map((recharge) => ({
        orderId: recharge.id,
        memberId: recharge.memberId,
        memberFirstName: recharge.memberFirstName,
        memberLastName: recharge.memberLastName,
        amount: recharge.price,
        date: recharge.date,
        paymentMethod: rechargeMethods[String(recharge.id)] ?? null,
      }));

    const rechargeTotals = rechargeList.reduce(
      (summary, recharge) => {
        const amount = Math.abs(Number(recharge.amount));
        summary.total += amount;
        summary.count += 1;
        if (recharge.paymentMethod === "card") {
          summary.card += amount;
          summary.cardCount += 1;
        } else if (recharge.paymentMethod === "cash") {
          summary.cash += amount;
          summary.cashCount += 1;
        } else {
          summary.unknown += amount;
          summary.unknownCount += 1;
        }
        return summary;
      },
      { total: 0, card: 0, cash: 0, unknown: 0, count: 0, cardCount: 0, cashCount: 0, unknownCount: 0 },
    );

    const rechargeSummary = {
      total: rechargeTotals.total.toFixed(2),
      card: rechargeTotals.card.toFixed(2),
      cash: rechargeTotals.cash.toFixed(2),
      unknown: rechargeTotals.unknown.toFixed(2),
      count: rechargeTotals.count,
      cardCount: rechargeTotals.cardCount,
      cashCount: rechargeTotals.cashCount,
      unknownCount: rechargeTotals.unknownCount,
    };

    return c.json({
      generatedAt: new Date().toISOString(),
      range: { from: request.from, to: request.to },
      accounting: accountingView(accounting),
      sales: sales
        .filter((sale) => !correctedOriginals.has(sale.id))
        .map((sale) => ({
          orderId: sale.id,
          memberId: sale.memberId,
          memberFirstName: sale.memberFirstName,
          memberLastName: sale.memberLastName,
          productId: sale.productId,
          productName: sale.productName,
          category: sale.category,
          amount: sale.amount,
          price: sale.price,
          date: sale.date,
          status: replacementIds.has(sale.id) ? "replacement" : "sale",
        })),
      recharges: rechargeList,
      rechargeSummary,
      corrections: corrections
        .filter((correction) =>
          rangeOrderIds.has(correction.originalOrderId) ||
          (correction.status === "completed" &&
            (rangeOrderIds.has(correction.refundOrderId) ||
              (correction.replacementOrderId !== null &&
                rangeOrderIds.has(correction.replacementOrderId)))),
        )
        .map((correction) => ({
          ...correction,
          originalProductName:
            correction.status === "completed"
              ? (productNames.get(correction.originalProductId) ?? null)
              : (saleProducts.get(correction.originalOrderId) ?? null),
          replacementProductName:
            correction.replacementProductId === null
              ? null
              : (productNames.get(correction.replacementProductId) ?? null),
        })),
    });
  }

  private async requireAdmin(cardNumber: number) {
    const member = await this.members.findFullByCardNumber(cardNumber);
    if (!member?.admin) throw new HTTPException(403, { message: "An administrator card is required" });
    return member;
  }
}
