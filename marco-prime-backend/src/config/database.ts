import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

// Fouaille stores order dates as MySQL TIMESTAMP values. Force both MySQL and
// the Node driver to UTC so the browser receives the real instant and applies
// Europe/Paris (including daylight-saving time) exactly once.
const pool = createPool({
  uri: databaseUrl,
  timezone: "Z",
});

pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'", (error) => {
    if (error) {
      connection.destroy();
      console.error("Unable to configure the MySQL session timezone", error);
    }
  });
});

export const db = drizzle(pool);
