import type { Context } from "hono";
import { sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../config/database.js";
import { deploymentMode, envFileEditable } from "../config/deployment.js";
import { auditEvent } from "../config/logger.js";
import { MemberRepository } from "../repositories/member.repository.js";
import {
  importEnv as importEnvFile,
  readEnvStatus,
  validateEnv as validateEnvContent,
} from "../services/env.service.js";

const CHECK_TIMEOUT_MS = 2_500;
const CACHE_DURATION_MS = 15_000;

type CheckResult = { available: boolean; latencyMs: number };
let cachedFouaille: { expiresAt: number; result: CheckResult } | null = null;

export class SystemController {
  private members = new MemberRepository();

  async getStatus(c: Context) {
    const [database, fouaille] = await Promise.all([
      timedCheck(async () => {
        await db.execute(sql`SELECT 1`);
      }),
      checkFouailleApi(),
    ]);

    return c.json({ backend: { available: true }, database, fouaille, deployment: {
      mode: deploymentMode(),
      envEditable: envFileEditable(),
    } });
  }

  async getEnv(c: Context) {
    this.requireEnvEditable();
    const request = c.req.valid("json" as never) as { adminCardNumber: number };
    await this.requireAdmin(request.adminCardNumber);
    return c.json(await readEnvStatus());
  }

  async validateEnv(c: Context) {
    this.requireEnvEditable();
    const request = c.req.valid("json" as never) as {
      adminCardNumber: number;
      content: string;
    };
    await this.requireAdmin(request.adminCardNumber);
    return c.json(await validateEnvContent(request.content));
  }

  async importEnv(c: Context) {
    this.requireEnvEditable();
    const request = c.req.valid("json" as never) as {
      adminCardNumber: number;
      content: string;
      restart: boolean;
    };
    const admin = await this.requireAdmin(request.adminCardNumber);
    const result = await importEnvFile(request.content, request.restart);
    if (result.imported) {
      auditEvent("system.env.imported", {
        adminMemberId: admin.id,
        restartScheduled: result.restartScheduled,
        backup: result.backup,
      });
    }
    return c.json(result, result.imported ? 200 : 400);
  }

  /**
   * Sur le serveur, la configuration est un fichier de l'hôte monté dans le
   * conteneur en lecture seule : la modifier depuis l'interface n'aurait aucun
   * effet et échouerait. On explique où agir plutôt que de laisser croire à un
   * import réussi.
   */
  private requireEnvEditable() {
    if (!envFileEditable()) {
      throw new HTTPException(409, {
        message:
          "Configuration gérée sur le serveur : modifiez .env.server sur l'hôte puis relancez ./server rebuild.",
      });
    }
  }

  private async requireAdmin(cardNumber: number) {
    const member = await this.members.findFullByCardNumber(cardNumber);
    if (!member?.admin) {
      throw new HTTPException(403, { message: "An administrator card is required" });
    }
    return member;
  }
}

async function checkFouailleApi(): Promise<CheckResult> {
  const now = Date.now();
  if (cachedFouaille && cachedFouaille.expiresAt > now) {
    return cachedFouaille.result;
  }

  const url = process.env.FOUAILLE_API_URL;
  if (!url) return { available: false, latencyMs: 0 };

  const result = await timedCheck(async () => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  });
  cachedFouaille = { expiresAt: now + CACHE_DURATION_MS, result };
  return result;
}

async function timedCheck(check: () => Promise<void>): Promise<CheckResult> {
  const startedAt = performance.now();
  try {
    await check();
    return {
      available: true,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  } catch {
    return {
      available: false,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }
}
