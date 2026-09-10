import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL de test absente");
}

const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = parsedDatabaseUrl.pathname.replace(/^\//, "").toLowerCase();
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "mysql"]);

if (!localHosts.has(parsedDatabaseUrl.hostname) || !databaseName.includes("test")) {
  throw new Error(
    "Tests refusés : DATABASE_URL doit viser une base locale dont le nom contient 'test'.",
  );
}

// Disable logging during tests
process.env.NODE_ENV = "test";
process.env.API_AUTH_ENABLED = "true";
process.env.API_TOKEN = "marco-prime-test-token";
