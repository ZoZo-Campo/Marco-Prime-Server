import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { config as loadEnv } from "dotenv";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "mysql"]);

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// .env.test is loaded first. An explicitly provided DATABASE_URL still wins,
// and .env is only a fallback so a production .env can never reset the test DB.
loadEnv({ path: path.resolve(".env.test"), override: false, quiet: true });
loadEnv({ path: path.resolve(".env"), override: false, quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail("DATABASE_URL de test absente : renseigne marco-prime-backend/.env.test.");
}

let database: URL;
try {
  database = new URL(databaseUrl);
} catch {
  fail("DATABASE_URL de test invalide.");
}

const databaseName = database.pathname.replace(/^\//, "").toLowerCase();
if (!LOCAL_HOSTS.has(database.hostname) || !databaseName.includes("test")) {
  fail(
    "Tests refusés : DATABASE_URL doit viser une base locale dont le nom contient 'test'. " +
      "La base de production n'est jamais utilisée.",
  );
}

const dataDirectory = await mkdtemp(path.join(tmpdir(), "marco-prime-tests-"));
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  MARCO_DATA_DIR: dataDirectory,
  FOUAILLE_API_URL: "",
  FOUAILLE_SYNC_ENABLED: "false",
  NODE_ENV: "test",
  API_AUTH_ENABLED: "true",
  API_TOKEN: "marco-prime-test-token",
};

console.log(`\n→ Base de test : ${database.hostname}/${databaseName}`);
console.log("→ Réinitialisation des données de démonstration…\n");

const seed = spawnSync(path.join("node_modules", ".bin", "tsx"), ["src/db/seed.ts"], {
  env,
  stdio: "inherit",
});
if (seed.status !== 0) {
  await rm(dataDirectory, { recursive: true, force: true });
  process.exit(seed.status ?? 1);
}

const vitestArgs = process.argv.slice(2);
if (vitestArgs.length === 0) vitestArgs.push("run");

const vitest = spawnSync(
  path.join("node_modules", ".bin", "vitest"),
  vitestArgs,
  { env, stdio: "inherit" },
);
await rm(dataDirectory, { recursive: true, force: true });
process.exit(vitest.status ?? 1);
