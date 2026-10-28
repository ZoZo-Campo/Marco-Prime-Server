import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, count, eq, like, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../config/database.js";
import { auditEvent } from "../config/logger.js";
import { members, products, productTypes } from "../db/schema.js";
import { MemberRepository } from "../repositories/member.repository.js";
import {
  adminBadgeSchema,
  adminMemberCreateSchema,
  adminMemberSearchSchema,
  adminProductAvailabilitySchema,
  adminProductCreateSchema,
  adminProductPriceSchema,
  adminReadSchema,
} from "../validators/admin-management.validator.js";

type Read = z.infer<typeof adminReadSchema>;
type Search = z.infer<typeof adminMemberSearchSchema>;
type CreateMember = z.infer<typeof adminMemberCreateSchema>;
type Badge = z.infer<typeof adminBadgeSchema>;
type CreateProduct = z.infer<typeof adminProductCreateSchema>;
type Availability = z.infer<typeof adminProductAvailabilitySchema>;
type PriceUpdate = z.infer<typeof adminProductPriceSchema>;

function duplicateConflict(error: unknown): never {
  const cause = error as { code?: string; cause?: { code?: string } };
  if (cause?.code === "ER_DUP_ENTRY" || cause?.cause?.code === "ER_DUP_ENTRY") {
    throw new HTTPException(409, { message: "Cette adresse, ce badge ou ce produit existe déjà" });
  }
  throw error;
}

export class AdminManagementController {
  private members = new MemberRepository();

  private requireDirectCatalogAccess() {
    if (process.env.FOUAILLE_SYNC_ENABLED === "true") {
      throw new HTTPException(409, {
        message: "Synchronisation automatique active : modifier les produits depuis Fouaille Manager",
      });
    }
  }

  private async requireAdmin(cardNumber: number) {
    const admin = await this.members.findFullByCardNumber(cardNumber);
    if (!admin?.admin) throw new HTTPException(403, { message: "Carte administrateur requise" });
    return admin;
  }

  async promotions(c: Context) {
    const { adminCardNumber } = c.req.valid("json" as never) as Read;
    await this.requireAdmin(adminCardNumber);
    const rows = await db.select({ promotion: members.class, total: count() })
      .from(members).groupBy(members.class).orderBy(asc(members.class));
    return c.json(rows.filter((row) => row.promotion !== null && row.promotion >= 2000 && row.promotion <= 2100));
  }

  async searchMembers(c: Context) {
    const { adminCardNumber, query, promotion } = c.req.valid("json" as never) as Search;
    await this.requireAdmin(adminCardNumber);
    const pattern = `%${query}%`;
    const rows = await db.select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      cardNumber: members.cardNumber,
      balance: members.balance,
      promotion: members.class,
      admin: members.admin,
    }).from(members).where(and(
      promotion === undefined ? undefined : eq(members.class, promotion),
      query.length < 2 ? undefined : or(
        like(members.firstName, pattern),
        like(members.lastName, pattern),
        sql`concat(${members.firstName}, ' ', ${members.lastName}) like ${pattern}`,
        sql`concat(${members.lastName}, ' ', ${members.firstName}) like ${pattern}`,
      ),
    )).orderBy(asc(members.lastName), asc(members.firstName)).limit(30);
    return c.json(rows);
  }

  async createMember(c: Context) {
    const request = c.req.valid("json" as never) as CreateMember;
    const admin = await this.requireAdmin(request.adminCardNumber);
    try {
      const [created] = await db.insert(members).values({
        firstName: request.firstName,
        lastName: request.lastName,
        email: request.email,
        class: request.promotion,
        cardNumber: request.cardNumber,
      }).$returningId();
      auditEvent("member.created", { adminMemberId: admin.id, memberId: created.id });
      return c.json({ id: created.id }, 201);
    } catch (error) {
      duplicateConflict(error);
    }
  }

  async replaceBadge(c: Context) {
    const request = c.req.valid("json" as never) as Badge;
    const admin = await this.requireAdmin(request.adminCardNumber);
    if (request.memberId === admin.id) {
      throw new HTTPException(400, { message: "Pour modifier votre propre badge, utilisez une autre carte administrateur" });
    }
    try {
      await db.transaction(async (tx) => {
        const [member] = await tx.select({ id: members.id, cardNumber: members.cardNumber })
          .from(members).where(eq(members.id, request.memberId)).for("update").limit(1);
        if (!member) throw new HTTPException(404, { message: "Membre introuvable" });
        if (member.cardNumber !== request.expectedCardNumber) {
          throw new HTTPException(409, { message: "Le badge a changé entre-temps. Rechargez la fiche." });
        }
        if (member.cardNumber === request.newCardNumber) return;
        await tx.update(members).set({ cardNumber: request.newCardNumber })
          .where(eq(members.id, request.memberId));
      });
      auditEvent("member.badge.changed", { adminMemberId: admin.id, memberId: request.memberId });
      return c.json({ success: true });
    } catch (error) {
      duplicateConflict(error);
    }
  }

  async productTypes(c: Context) {
    const { adminCardNumber } = c.req.valid("json" as never) as Read;
    await this.requireAdmin(adminCardNumber);
    return c.json(await db.select({ id: productTypes.id, type: productTypes.type })
      .from(productTypes).orderBy(asc(productTypes.id)));
  }

  async createProduct(c: Context) {
    const request = c.req.valid("json" as never) as CreateProduct;
    const admin = await this.requireAdmin(request.adminCardNumber);
    this.requireDirectCatalogAccess();
    const [type] = await db.select({ id: productTypes.id }).from(productTypes)
      .where(eq(productTypes.id, request.productTypeId)).limit(1);
    if (!type) throw new HTTPException(400, { message: "Catégorie Fouaille inconnue" });
    try {
      const [created] = await db.insert(products).values({
        name: request.name,
        title: request.title,
        price: Number(request.price).toFixed(2),
        productTypeId: request.productTypeId,
        color: request.color,
        available: false,
      }).$returningId();
      auditEvent("product.created", { adminMemberId: admin.id, productId: created.id });
      return c.json({ id: created.id, available: false }, 201);
    } catch (error) {
      duplicateConflict(error);
    }
  }

  async setAvailability(c: Context) {
    const request = c.req.valid("json" as never) as Availability;
    const admin = await this.requireAdmin(request.adminCardNumber);
    this.requireDirectCatalogAccess();
    await db.transaction(async (tx) => {
      const [product] = await tx.select({ available: products.available })
        .from(products).where(eq(products.id, request.productId)).for("update").limit(1);
      if (!product) throw new HTTPException(404, { message: "Produit introuvable" });
      if (product.available !== request.expectedAvailable) {
        throw new HTTPException(409, { message: "Disponibilité modifiée entre-temps. Rechargez le catalogue." });
      }
      if (product.available !== request.available) {
        await tx.update(products).set({ available: request.available })
          .where(eq(products.id, request.productId));
      }
    });
    auditEvent("product.availability.changed", {
      adminMemberId: admin.id, productId: request.productId, available: request.available,
    });
    return c.json({ success: true });
  }

  async setPrice(c: Context) {
    const request = c.req.valid("json" as never) as PriceUpdate;
    const admin = await this.requireAdmin(request.adminCardNumber);
    this.requireDirectCatalogAccess();
    const newPrice = Number(request.price).toFixed(2);
    await db.transaction(async (tx) => {
      const [product] = await tx.select({ price: products.price })
        .from(products).where(eq(products.id, request.productId)).for("update").limit(1);
      if (!product) throw new HTTPException(404, { message: "Produit introuvable" });
      if (Number(product.price) !== Number(request.expectedPrice)) {
        throw new HTTPException(409, { message: "Le prix a changé entre-temps. Rechargez le catalogue avant de réessayer." });
      }
      if (product.price !== newPrice) {
        await tx.update(products).set({ price: newPrice }).where(eq(products.id, request.productId));
      }
    });
    auditEvent("product.price.changed", {
      adminMemberId: admin.id,
      productId: request.productId,
      previousPrice: Number(request.expectedPrice).toFixed(2),
      price: newPrice,
    });
    return c.json({ success: true, price: newPrice });
  }
}
