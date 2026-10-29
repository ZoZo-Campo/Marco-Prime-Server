import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { db } from "../src/config/database.js";
import { members } from "../src/db/schema.js";
import { configAuthService } from "../src/services/config-auth.service.js";
import { authenticatedOptions } from "./utils/helpers.js";

const PASSWORD = "motdepasse-test";
const SENSITIVE_BODY = { adminCardNumber: 0 };

describe("Admin session and first-password bootstrap", () => {
  const client = testClient(app);
  let dataDirectory: string;
  let previousDataDirectory: string | undefined;
  let previousDeployment: string | undefined;
  let adminCardNumber: number;
  let otherAdminCardNumber: number;

  beforeAll(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), "marco-admin-session-"));
    previousDataDirectory = process.env.MARCO_DATA_DIR;
    previousDeployment = process.env.MARCO_DEPLOYMENT;
    process.env.MARCO_DATA_DIR = dataDirectory;
    process.env.MARCO_DEPLOYMENT = "server";
    await configAuthService.removePassword();

    const admins = await db
      .select({ cardNumber: members.cardNumber })
      .from(members)
      .where(eq(members.admin, true))
      .limit(2);
    const cards = admins
      .map((admin) => admin.cardNumber)
      .filter((card): card is number => card !== null);
    if (cards.length < 2) {
      throw new Error("Two admin cards are required for the session tests");
    }
    adminCardNumber = cards[0]!;
    otherAdminCardNumber = cards[1]!;
    SENSITIVE_BODY.adminCardNumber = adminCardNumber;
  });

  afterAll(async () => {
    await configAuthService.removePassword();
    if (previousDataDirectory === undefined) {
      delete process.env.MARCO_DATA_DIR;
    } else {
      process.env.MARCO_DATA_DIR = previousDataDirectory;
    }
    if (previousDeployment === undefined) {
      delete process.env.MARCO_DEPLOYMENT;
    } else {
      process.env.MARCO_DEPLOYMENT = previousDeployment;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it("requires a signed session for sensitive routes", async () => {
    await configAuthService.setPassword(adminCardNumber, PASSWORD);

    const denied = await client.api.v1.statistics.costs.$post(
      { json: SENSITIVE_BODY },
      authenticatedOptions,
    );
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({
      error: expect.stringContaining("Session administrateur requise"),
    });

    const wrongPassword = await client.api.v1["config-auth"].unlock.$post(
      { json: { password: "mauvais-mot-de-passe", adminCardNumber } },
      authenticatedOptions,
    );
    expect(wrongPassword.status).toBe(401);

    const unlocked = await client.api.v1["config-auth"].unlock.$post(
      { json: { password: PASSWORD, adminCardNumber } },
      authenticatedOptions,
    );
    expect(unlocked.status).toBe(200);
    const unlockedBody = await unlocked.json();
    expect(unlockedBody.member.cardNumber).toBe(adminCardNumber);
    expect(typeof unlockedBody.adminToken).toBe("string");
    expect(typeof unlockedBody.expiresAt).toBe("string");

    const signedHeaders = {
      ...authenticatedOptions.headers,
      "X-Admin-Token": unlockedBody.adminToken,
    };
    const allowed = await client.api.v1.statistics.costs.$post(
      { json: SENSITIVE_BODY },
      { headers: signedHeaders },
    );
    expect(allowed.status).toBe(200);

    const wrongCard = await client.api.v1.statistics.costs.$post(
      { json: { adminCardNumber: otherAdminCardNumber } },
      { headers: signedHeaders },
    );
    expect(wrongCard.status).toBe(403);

    const invalidToken = await client.api.v1.statistics.costs.$post(
      { json: SENSITIVE_BODY },
      {
        headers: {
          ...authenticatedOptions.headers,
          "X-Admin-Token": "jeton-invalide",
        },
      },
    );
    expect(invalidToken.status).toBe(401);

    const mismatchedUnlock = await client.api.v1["config-auth"].unlock.$post(
      {
        json: { password: PASSWORD, adminCardNumber: otherAdminCardNumber },
      },
      authenticatedOptions,
    );
    expect(mismatchedUnlock.status).toBe(401);
  });

  it("requires the server setup token for the first password", async () => {
    await configAuthService.removePassword();

    const status = await client.api.v1["config-auth"].status.$get(
      undefined,
      authenticatedOptions,
    );
    expect(await status.json()).toMatchObject({ configured: false });

    const refused = await client.api.v1["config-auth"].setup.$post(
      { json: { adminCardNumber, password: PASSWORD } },
      authenticatedOptions,
    );
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({
      error: expect.stringContaining("Jeton d'installation requis"),
    });

    const accepted = await client.api.v1["config-auth"].setup.$post(
      { json: { adminCardNumber, password: PASSWORD } },
      {
        headers: {
          ...authenticatedOptions.headers,
          "X-Setup-Token": process.env.API_TOKEN ?? "",
        },
      },
    );
    expect(accepted.status).toBe(200);
    const acceptedBody = await accepted.json();
    expect(typeof acceptedBody.adminToken).toBe("string");

    const configured = await client.api.v1["config-auth"].status.$get(
      undefined,
      authenticatedOptions,
    );
    expect(await configured.json()).toMatchObject({ configured: true });

    const allowed = await client.api.v1.statistics.costs.$post(
      { json: SENSITIVE_BODY },
      {
        headers: {
          ...authenticatedOptions.headers,
          "X-Admin-Token": acceptedBody.adminToken,
        },
      },
    );
    expect(allowed.status).toBe(200);
  });
});
