import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { MemberRepository } from "../repositories/member.repository.js";
import { StatisticsRepository } from "../repositories/statistics.repository.js";
import { productCostService } from "../services/product-cost.service.js";
import { orderCorrectionService } from "../services/order-correction.service.js";
import type {
  statisticsCostQuerySchema,
  statisticsCostUpdateSchema,
  statisticsQuerySchema,
} from "../validators/statistics.validator.js";

type StatisticsQuery = z.infer<typeof statisticsQuerySchema>;
type StatisticsCostQuery = z.infer<typeof statisticsCostQuerySchema>;
type StatisticsCostUpdate = z.infer<typeof statisticsCostUpdateSchema>;

export class StatisticsController {
  private memberRepository = new MemberRepository();
  private statisticsRepository = new StatisticsRepository();

  async getStatistics(c: Context) {
    const request = c.req.valid("json" as never) as StatisticsQuery;
    await this.requireAdmin(request.adminCardNumber);

    const from = new Date(request.from);
    const to = new Date(request.to);
    const [allSales, allRecharges, costs, corrections] = await Promise.all([
      this.statisticsRepository.findSales(from, to),
      this.statisticsRepository.findRecharges(from, to),
      productCostService.getCosts(),
      orderCorrectionService.all(),
    ]);
    const completedCorrections = corrections.filter(
      (correction) => correction.status === "completed",
    );
    const replacedSaleIds = new Set(
      completedCorrections.map((correction) => correction.originalOrderId),
    );
    const refundOrderIds = new Set(
      completedCorrections.map((correction) => correction.refundOrderId),
    );
    const sales = allSales.filter((sale) => !replacedSaleIds.has(sale.id));
    const recharges = allRecharges.filter(
      (recharge) => !refundOrderIds.has(recharge.id),
    );

    const byProduct = new Map<
      number,
      {
        productId: number;
        name: string;
        category: string;
        quantity: number;
        revenueCents: number;
        costCents: number;
        costConfigured: boolean;
      }
    >();
    const members = new Set<number>();
    let legacyLineCount = 0;

    for (const sale of sales) {
      if (sale.amount <= 0) continue;
      const storedCents = toCents(sale.price);
      if (storedCents === null) continue;
      const revenueCents =
        storedCents < 0 ? -storedCents : storedCents * sale.amount;
      if (storedCents >= 0) legacyLineCount += 1;
      if (sale.memberId !== null) members.add(sale.memberId);

      const configuredCost = costs.get(sale.productId);
      const unitCostCents = configuredCost ? toCents(configuredCost) ?? 0 : 0;
      const current = byProduct.get(sale.productId) ?? {
        productId: sale.productId,
        name: sale.productName,
        category: sale.category,
        quantity: 0,
        revenueCents: 0,
        costCents: 0,
        costConfigured: configuredCost !== undefined,
      };
      current.quantity += sale.amount;
      current.revenueCents += revenueCents;
      current.costCents += unitCostCents * sale.amount;
      byProduct.set(sale.productId, current);
    }

    const products = [...byProduct.values()]
      .map((product) => ({
        productId: product.productId,
        name: product.name,
        category: product.category,
        quantity: product.quantity,
        revenue: fromCents(product.revenueCents),
        cost: fromCents(product.costCents),
        profit: fromCents(product.revenueCents - product.costCents),
        costConfigured: product.costConfigured,
      }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));

    const revenueCents = products.reduce(
      (total, product) => total + Math.round(Number(product.revenue) * 100),
      0,
    );
    const costCents = products.reduce(
      (total, product) => total + Math.round(Number(product.cost) * 100),
      0,
    );
    const rechargeCents = recharges.reduce((total, recharge) => {
      const cents = toCents(recharge.price);
      return cents && cents > 0 ? total + cents : total;
    }, 0);

    return c.json({
      generatedAt: new Date().toISOString(),
      range: { from: request.from, to: request.to },
      summary: {
        salesLines: sales.length,
        unitsSold: products.reduce((total, product) => total + product.quantity, 0),
        uniqueMembers: members.size,
        revenue: fromCents(revenueCents),
        cost: fromCents(costCents),
        profit: fromCents(revenueCents - costCents),
        rechargeCount: recharges.length,
        rechargeAmount: fromCents(rechargeCents),
        unconfiguredProductCount: products.filter(
          (product) => !product.costConfigured,
        ).length,
        legacyLineCount,
      },
      products,
    });
  }

  async getCosts(c: Context) {
    const { adminCardNumber } = c.req.valid(
      "json" as never,
    ) as StatisticsCostQuery;
    await this.requireAdmin(adminCardNumber);
    const [products, costs] = await Promise.all([
      this.statisticsRepository.findProducts(),
      productCostService.getCosts(),
    ]);

    return c.json(
      products.map((product) => ({
        ...product,
        costPrice: costs.get(product.id) ?? null,
      })),
    );
  }

  async updateCosts(c: Context) {
    const { adminCardNumber, costs } = c.req.valid(
      "json" as never,
    ) as StatisticsCostUpdate;
    await this.requireAdmin(adminCardNumber);

    const products = await this.statisticsRepository.findProducts();
    const productIds = new Set(products.map((product) => product.id));
    if (costs.some((cost) => !productIds.has(cost.productId))) {
      throw new HTTPException(400, { message: "Unknown product in cost list" });
    }

    const savedCount = await productCostService.replace(costs);
    return c.json({ success: true, savedCount });
  }

  private async requireAdmin(cardNumber: number) {
    const member = await this.memberRepository.findFullByCardNumber(cardNumber);
    if (!member?.admin) {
      throw new HTTPException(403, {
        message: "An administrator card is required",
      });
    }
  }
}

function toCents(value: string): number | null {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function fromCents(value: number) {
  return (value / 100).toFixed(2);
}
