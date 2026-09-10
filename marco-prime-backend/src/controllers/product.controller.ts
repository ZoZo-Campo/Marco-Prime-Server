import type { Context } from "hono";
import type { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { CatalogSelectionRepository } from "../repositories/catalog-selection.repository.js";
import { MemberRepository } from "../repositories/member.repository.js";
import { catalogSelectionService } from "../services/catalog-selection.service.js";
import { ProductRepository } from "../repositories/product.repository.js";
import { ProductTypeRepository } from "../repositories/product-type.repository.js";
import {
  productPaginationQuerySchema,
  productTypeParamSchema,
  catalogSelectionRequestSchema,
} from "../validators/products.validator.js";

type ProductTypeParam = z.infer<typeof productTypeParamSchema>;
type ProductPaginationQuery = z.infer<typeof productPaginationQuerySchema>;
type CatalogSelectionRequest = z.infer<typeof catalogSelectionRequestSchema>;

export class ProductController {
  private productRepository = new ProductRepository();
  private productTypeRepository = new ProductTypeRepository();
  private catalogSelectionRepository = new CatalogSelectionRepository();
  private memberRepository = new MemberRepository();

  async getAllProducts(c: Context) {
    const allProducts = await this.productRepository.findAll();
    return c.json(
      allProducts.map((product) => ({
        ...product,
        color: product.color || "#64748b",
      })),
    );
  }

  async getProductTypes(c: Context) {
    const selectedProductIds =
      await catalogSelectionService.getSelectedProductIds();
    const productTypes =
      await this.productTypeRepository.findAllWithAvailableProductCount(
        selectedProductIds,
      );
    return c.json(productTypes);
  }

  async getProductsByType(c: Context) {
    const { product_type_id: productTypeId } = c.req.valid(
      "param" as never,
    ) as ProductTypeParam;
    const { page, limit } = c.req.valid(
      "query" as never,
    ) as ProductPaginationQuery;
    const offset = (page - 1) * limit;
    const selectedProductIds =
      await catalogSelectionService.getSelectedProductIds();

    const [data, total] = await Promise.all([
      this.productRepository.findAvailableByType(
        productTypeId,
        limit,
        offset,
        selectedProductIds,
      ),
      this.productRepository.countAvailableByType(
        productTypeId,
        selectedProductIds,
      ),
    ]);

    return c.json({
      data: data.map((product) => ({
        ...product,
        color: product.color || "#64748b",
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }

  async getCatalogSelection(c: Context) {
    const products = await this.catalogSelectionRepository.findAvailableCatalog();
    const selectedProductIds =
      await catalogSelectionService.getSelectedProductIds();
    const selectedSet = selectedProductIds
      ? new Set(selectedProductIds)
      : null;

    return c.json(
      products.map(({ color, ...product }) => ({
        ...product,
        color: color || "#64748b",
        enabledOnMarco: selectedSet === null || selectedSet.has(product.id),
      })),
    );
  }

  async updateCatalogSelection(c: Context) {
    const { adminCardNumber, productIds } = c.req.valid(
      "json" as never,
    ) as CatalogSelectionRequest;
    const admin = await this.memberRepository.findFullByCardNumber(adminCardNumber);

    if (!admin || !admin.admin) {
      throw new HTTPException(403, {
        message: "An administrator card is required",
      });
    }

    try {
      const availableCount =
        await this.catalogSelectionRepository.countAvailableProducts(productIds);
      if (availableCount !== productIds.length) {
        throw new Error("INVALID_PRODUCT_SELECTION");
      }
      const selectedCount = await catalogSelectionService.replace(productIds);
      return c.json({ success: true, selectedCount });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_PRODUCT_SELECTION") {
        throw new HTTPException(400, {
          message: "The selection contains an unavailable Fouaille product",
        });
      }
      throw error;
    }
  }
}
