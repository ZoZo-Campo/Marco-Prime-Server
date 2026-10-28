import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const rechargeMethodSchema = z.enum(["card", "cash"]);
export type RechargeMethod = z.infer<typeof rechargeMethodSchema>;

// Entrée du registre local : le mode de paiement + le contexte du membre, afin
// de pouvoir fusionner ce rechargement local avec la ligne correspondante en base
// (par orderId, et à défaut par numéro de carte / nom).
const entrySchema = z.object({
  method: rechargeMethodSchema,
  cardNumber: z.number().int().positive().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  amount: z.string().optional(),
  orderDate: z.string().optional(),
  recordedAt: z.string(),
});
export type RechargeEntry = z.infer<typeof entrySchema>;

const storedSchema = z.object({
  version: z.literal(2),
  entries: z.record(z.string(), entrySchema),
});
type Stored = z.infer<typeof storedSchema>;

const legacySchema = z.record(z.string(), rechargeMethodSchema);

let pendingWrite: Promise<void> = Promise.resolve();

function filePath() {
  return path.join(process.env.MARCO_DATA_DIR || "./data", "recharge-methods.json");
}

async function readStored(): Promise<Stored> {
  let raw: string;
  try {
    raw = await readFile(filePath(), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { version: 2, entries: {} };
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  const current = storedSchema.safeParse(parsed);
  if (current.success) return current.data;

  // Rétrocompatibilité : ancien format plat { orderId: "card" | "cash" }.
  const legacy = legacySchema.safeParse(parsed);
  if (legacy.success) {
    return {
      version: 2,
      entries: Object.fromEntries(
        Object.entries(legacy.data).map(([orderId, method]) => [
          orderId,
          { method, recordedAt: new Date(0).toISOString() },
        ]),
      ),
    };
  }

  return { version: 2, entries: {} };
}

export async function readRechargeLedger(): Promise<Record<string, RechargeEntry>> {
  return (await readStored()).entries;
}

export async function readRechargeMethods(): Promise<Record<string, RechargeMethod>> {
  const entries = await readRechargeLedger();
  return Object.fromEntries(
    Object.entries(entries).map(([orderId, entry]) => [orderId, entry.method]),
  );
}

export interface RechargeDetails {
  cardNumber?: number;
  firstName?: string;
  lastName?: string;
  amount?: string;
  orderDate?: string;
}

async function writeStored(stored: Stored) {
  const target = filePath();
  const temporary = `${target}.${process.pid}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, target);
}

export function recordRechargeMethod(
  orderId: number,
  method: RechargeMethod,
  details: RechargeDetails = {},
): Promise<void> {
  const write = pendingWrite.catch(() => {}).then(async () => {
    const stored = await readStored();
    stored.entries[String(orderId)] = {
      method,
      ...(details.cardNumber === undefined ? {} : { cardNumber: details.cardNumber }),
      ...(details.firstName ? { firstName: details.firstName } : {}),
      ...(details.lastName ? { lastName: details.lastName } : {}),
      ...(details.amount ? { amount: details.amount } : {}),
      ...(details.orderDate ? { orderDate: details.orderDate } : {}),
      recordedAt: new Date().toISOString(),
    };
    await writeStored(stored);
  });
  pendingWrite = write;
  return write;
}

export function removeRechargeMethod(orderId: number): Promise<void> {
  const write = pendingWrite.catch(() => {}).then(async () => {
    const stored = await readStored();
    delete stored.entries[String(orderId)];
    await writeStored(stored);
  });
  pendingWrite = write;
  return write;
}
