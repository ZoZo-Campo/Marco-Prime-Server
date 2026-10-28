import type { Context } from "hono";
import type { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { auditEvent } from "../config/logger.js";
import { MemberRepository } from "../repositories/member.repository.js";
import { configAuthService } from "../services/config-auth.service.js";
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
    const { password } = c.req.valid("json" as never) as ConfigPasswordUnlockRequest;
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

    auditEvent("config.unlocked_with_password", {
      adminMemberId: full.id,
    });
    return c.json({ success: true, member });
  }

  async setup(c: Context) {
    const request = c.req.valid("json" as never) as ConfigPasswordSetupRequest;
    const admin = await this.requireAdmin(request.adminCardNumber);
    await configAuthService.setPassword(admin.cardNumber!, request.password);
    auditEvent("config.password_set", { adminMemberId: admin.id });
    return c.json({ success: true });
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
