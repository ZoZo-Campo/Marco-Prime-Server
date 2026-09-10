import type { Context } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../config/database.js";

const CHECK_TIMEOUT_MS = 2_500;
const CACHE_DURATION_MS = 15_000;

type CheckResult = { available: boolean; latencyMs: number };
let cachedFouaille: { expiresAt: number; result: CheckResult } | null = null;

export class SystemController {
  async getStatus(c: Context) {
    const [database, fouaille] = await Promise.all([
      timedCheck(async () => {
        await db.execute(sql`SELECT 1`);
      }),
      checkFouailleApi(),
    ]);

    return c.json({ backend: { available: true }, database, fouaille });
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
