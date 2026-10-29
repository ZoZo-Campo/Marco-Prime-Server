import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import type { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { auditEvent } from "../config/logger.js";
import { adminSessionRequired } from "../config/deployment.js";
import { MemberRepository } from "../repositories/member.repository.js";
import { configAuthService } from "../services/config-auth.service.js";
import { createAdminSession } from "../services/admin-session.service.js";
import {
  configPasswordDisableSchema,
  configPasswordSetupSchema,
  configPasswordUnlockSchema,
} from "../validators/config-auth.validator.js";

type ConfigPasswordSetupRequest = z.infer<typeof configPasswordSetupSchema>;
type ConfigPasswordUnlockRequest = z.infer<typeof configPasswordUnlockSchema>;
type ConfigPasswordDisableRequest = z.infer<typeof configPasswordDisableSchema>;

export class ConfigAuthController {
  private memberRepository = new MemberRepository();

  async status(c: Context) {
    return c.json(await configAuthService.status());
  }

  async unlock(c: Context) {
    const { password, adminCardNumber } = c.req.valid(
      "json" as never,
    ) as ConfigPasswordUnlockRequest;
    const result = await configAuthService.verifyPassword(password);
    if (result.status === "locked") {
      throw new HTTPException(429, {
        message: "Trop de tentatives. Réessayez dans 30 secondes.",
      });
    }
    if (result.status === "not-configured") {
      throw new HTTPException(404, {
        message: "Aucun mot de passe de configuration n’est défini",
      });
    }
    if (result.status === "invalid") {
      throw new HTTPException(401, { message: "Mot de passe incorrect" });
    }
    if (
      adminCardNumber !== undefined &&
      adminCardNumber !== result.adminCardNumber
    ) {
      // Même réponse qu'un mot de passe faux : ne pas révéler la carte
      // associée au mot de passe de configuration.
      throw new HTTPException(401, { message: "Mot de passe ou carte incorrects" });
    }

    const full = await this.memberRepository.findFullByCardNumber(
      result.adminCardNumber,
    );
    if (!full?.admin) {
      throw new HTTPException(403, {
        message: "Le compte administrateur associé n’est plus autorisé",
      });
    }
    const member = await this.memberRepository.findByCardNumber(
      result.adminCardNumber,
    );
    if (!member) {
      throw new HTTPException(404, { message: "Administrateur introuvable" });
    }

    const session = createAdminSession({
      id: full.id,
      cardNumber: full.cardNumber!,
    });
    auditEvent("config.unlocked_with_password", {
      adminMemberId: full.id,
    });
    if (session) {
      auditEvent("admin.session_opened", {
        adminMemberId: full.id,
        expiresAt: new Date(session.expiresAt).toISOString(),
      });
    }
    return c.json({
      success: true,
      member,
      ...(session
        ? {
            adminToken: session.token,
            expiresAt: new Date(session.expiresAt).toISOString(),
          }
        : {}),
    });
  }

  async setup(c: Context) {
    const request = c.req.valid("json" as never) as ConfigPasswordSetupRequest;
    const status = await configAuthService.status();

    // Premier mot de passe en mode serveur : il faut prouver un accès au
    // serveur (le jeton d'API se trouve dans .env.server). Sans cette preuve,
    // une carte admin énumérée suffirait à prendre le contrôle avant le vrai
    // administrateur.
    if (!status.configured && adminSessionRequired()) {
      const provided = c.req.header("x-setup-token") ?? "";
      if (!sameSecret(provided, process.env.API_TOKEN ?? "")) {
        auditEvent("admin.setup_token_rejected", {});
        throw new HTTPException(403, {
          message:
            "Jeton d'installation requis pour définir le premier mot de passe (variable API_TOKEN de .env.server)",
        });
      }
    }

    const admin = await this.requireAdmin(request.adminCardNumber);
    await configAuthService.setPassword(admin.cardNumber!, request.password);
    auditEvent("config.password_set", { adminMemberId: admin.id });
    // Le premier mot de passe vient d'être défini : ouvrir immédiatement la
    // session évite de redemander le mot de passe dans la foulée.
    const session = createAdminSession({
      id: admin.id,
      cardNumber: admin.cardNumber!,
    });
    return c.json({
      success: true,
      ...(session
        ? {
            adminToken: session.token,
            expiresAt: new Date(session.expiresAt).toISOString(),
          }
        : {}),
    });
  }

  async disable(c: Context) {
    const request = c.req.valid("json" as never) as ConfigPasswordDisableRequest;
    const admin = await this.requireAdmin(request.adminCardNumber);
    await configAuthService.removePassword();
    auditEvent("config.password_removed", { adminMemberId: admin.id });
    return c.json({ success: true });
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
}

function sameSecret(provided: string, expected: string) {
  if (!expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
