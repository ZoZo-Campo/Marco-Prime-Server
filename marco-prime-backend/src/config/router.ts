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
import { AdminManagementController } from "../controllers/admin-management.controller.js";
import { ConfigAuthController } from "../controllers/config-auth.controller.js";
import { cardNumberParamSchema, memberSearchSchema } from "../validators/members.validator.js";
import {
  configPasswordDisableSchema,
  configPasswordSetupSchema,
  configPasswordUnlockSchema,
} from "../validators/config-auth.validator.js";
import { historyQuerySchema } from "../validators/orders.validator.js";
import {
  catalogSelectionRequestSchema,
  productPaginationQuerySchema,
  productTypeParamSchema,
} from "../validators/products.validator.js";
import { purchaseRequestSchema } from "../validators/purchase.validator.js";
import {
  rechargeCorrectionSchema,
  rechargeMethodUpdateSchema,
  rechargeRequestSchema,
} from "../validators/recharge.validator.js";
import {
  statisticsCostQuerySchema,
  statisticsCostUpdateSchema,
  statisticsQuerySchema,
} from "../validators/statistics.validator.js";
import { accountingExportSchema, accountingReadSchema, accountingUpdateSchema } from "../validators/accounting.validator.js";
import { correctionListSchema, correctionRequestSchema } from "../validators/order-correction.validator.js";
import {
  adminBadgeSchema,
  adminMemberCreateSchema,
  adminMemberSearchSchema,
  adminProductAvailabilitySchema,
  adminProductCreateSchema,
  adminProductPriceSchema,
  adminReadSchema,
} from "../validators/admin-management.validator.js";
import {
  envAdminSchema,
  envImportSchema,
  envValidateSchema,
} from "../validators/env.validator.js";

const memberController = new MemberController();
const productController = new ProductController();
const orderController = new OrderController();
const purchaseController = new PurchaseController();
const rechargeController = new RechargeController();
const statisticsController = new StatisticsController();
const systemController = new SystemController();
const accountingController = new AccountingController();
const correctionController = new OrderCorrectionController();
const adminManagement = new AdminManagementController();
const configAuthController = new ConfigAuthController();

const router = new Hono()
  .get("/config-auth/status", (c) => configAuthController.status(c))
  .post(
    "/config-auth/unlock",
    zValidator("json", configPasswordUnlockSchema),
    (c) => configAuthController.unlock(c),
  )
  .post(
    "/config-auth/setup",
    zValidator("json", configPasswordSetupSchema),
    (c) => configAuthController.setup(c),
  )
  .put(
    "/config-auth/password",
    zValidator("json", configPasswordSetupSchema),
    (c) => configAuthController.setup(c),
  )
  .post(
    "/config-auth/disable",
    zValidator("json", configPasswordDisableSchema),
    (c) => configAuthController.disable(c),
  )
  .get("/system/status", (c) => systemController.getStatus(c))
  .post("/system/env/status", zValidator("json", envAdminSchema), (c) =>
    systemController.getEnv(c),
  )
  .post("/system/env/validate", zValidator("json", envValidateSchema), (c) =>
    systemController.validateEnv(c),
  )
  .post("/system/env", zValidator("json", envImportSchema), (c) =>
    systemController.importEnv(c),
  )
  .get(
    "/member/:card_number",
    zValidator("param", cardNumberParamSchema),
    (c) => memberController.getMemberByCardNumber(c),
  )
  .get("/member-promotions", (c) => memberController.listPromotions(c))
  .post("/members/search", zValidator("json", memberSearchSchema), (c) =>
    memberController.searchMembers(c),
  )
  .post("/admin/promotions", zValidator("json", adminReadSchema), (c) =>
    adminManagement.promotions(c),
  )
  .post("/admin/members/search", zValidator("json", adminMemberSearchSchema), (c) =>
    adminManagement.searchMembers(c),
  )
  .post("/admin/members", zValidator("json", adminMemberCreateSchema), (c) =>
    adminManagement.createMember(c),
  )
  .put("/admin/members/badge", zValidator("json", adminBadgeSchema), (c) =>
    adminManagement.replaceBadge(c),
  )
  .post("/admin/product-types", zValidator("json", adminReadSchema), (c) =>
    adminManagement.productTypes(c),
  )
  .post("/admin/products", zValidator("json", adminProductCreateSchema), (c) =>
    adminManagement.createProduct(c),
  )
  .put("/admin/products/availability", zValidator("json", adminProductAvailabilitySchema), (c) =>
    adminManagement.setAvailability(c),
  )
  .put("/admin/products/price", zValidator("json", adminProductPriceSchema), (c) =>
    adminManagement.setPrice(c),
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
  .get("/history", zValidator("query", historyQuerySchema), (c) =>
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
  .post(
    "/accounting/export",
    zValidator("json", accountingExportSchema),
    (c) => accountingController.export(c),
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
  )
  .put(
    "/recharge-method",
    zValidator("json", rechargeMethodUpdateSchema),
    (c) => rechargeController.updateMethod(c),
  )
  .post(
    "/recharge-corrections/apply",
    zValidator("json", rechargeCorrectionSchema),
    (c) => rechargeController.cancel(c),
  );

export { router };
