import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { MemberController } from "../controllers/member.controller.js";
import { OrderController } from "../controllers/order.controller.js";
import { ProductController } from "../controllers/product.controller.js";
import { PurchaseController } from "../controllers/purchase.controller.js";
import { RechargeController } from "../controllers/recharge.controller.js";
import { StatisticsController } from "../controllers/statistics.controller.js";
import { SystemController } from "../controllers/system.controller.js";
import { AccountingController } from "../controllers/accounting.controller.js";
import { OrderCorrectionController } from "../controllers/order-correction.controller.js";
import { cardNumberParamSchema } from "../validators/members.validator.js";
import { paginationQuerySchema } from "../validators/orders.validator.js";
import {
  catalogSelectionRequestSchema,
  productPaginationQuerySchema,
  productTypeParamSchema,
} from "../validators/products.validator.js";
import { purchaseRequestSchema } from "../validators/purchase.validator.js";
import { rechargeRequestSchema } from "../validators/recharge.validator.js";
import {
  statisticsCostQuerySchema,
  statisticsCostUpdateSchema,
  statisticsQuerySchema,
} from "../validators/statistics.validator.js";
import { accountingReadSchema, accountingUpdateSchema } from "../validators/accounting.validator.js";
import { correctionListSchema, correctionRequestSchema } from "../validators/order-correction.validator.js";

const memberController = new MemberController();
const productController = new ProductController();
const orderController = new OrderController();
const purchaseController = new PurchaseController();
const rechargeController = new RechargeController();
const statisticsController = new StatisticsController();
const systemController = new SystemController();
const accountingController = new AccountingController();
const correctionController = new OrderCorrectionController();

const router = new Hono()
  .get("/system/status", (c) => systemController.getStatus(c))
  .get(
    "/member/:card_number",
    zValidator("param", cardNumberParamSchema),
    (c) => memberController.getMemberByCardNumber(c),
  )
  .get("/products", (c) => productController.getAllProducts(c))
  .get("/catalog-selection", (c) => productController.getCatalogSelection(c))
  .put(
    "/catalog-selection",
    zValidator("json", catalogSelectionRequestSchema),
    (c) => productController.updateCatalogSelection(c),
  )
  .get("/product-types", (c) => productController.getProductTypes(c))
  .get(
    "/products/:product_type_id",
    zValidator("param", productTypeParamSchema),
    zValidator("query", productPaginationQuerySchema),
    (c) => productController.getProductsByType(c),
  )
  .get("/history", zValidator("query", paginationQuerySchema), (c) =>
    orderController.getOrdersHistory(c),
  )
  .post(
    "/statistics",
    zValidator("json", statisticsQuerySchema),
    (c) => statisticsController.getStatistics(c),
  )
  .post(
    "/statistics/costs",
    zValidator("json", statisticsCostQuerySchema),
    (c) => statisticsController.getCosts(c),
  )
  .put(
    "/statistics/costs",
    zValidator("json", statisticsCostUpdateSchema),
    (c) => statisticsController.updateCosts(c),
  )
  .post("/accounting", zValidator("json", accountingReadSchema), (c) =>
    accountingController.get(c),
  )
  .put("/accounting", zValidator("json", accountingUpdateSchema), (c) =>
    accountingController.update(c),
  )
  .post("/order-corrections", zValidator("json", correctionListSchema), (c) =>
    correctionController.list(c),
  )
  .post("/order-corrections/apply", zValidator("json", correctionRequestSchema), (c) =>
    correctionController.apply(c),
  )
  .post("/purchase", zValidator("json", purchaseRequestSchema), (c) =>
    purchaseController.createPurchase(c),
  )
  .post("/recharge", zValidator("json", rechargeRequestSchema), (c) =>
    rechargeController.createRecharge(c),
  );

export { router };
