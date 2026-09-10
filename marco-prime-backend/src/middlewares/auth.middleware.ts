import "dotenv/config";
import type { Context, Next } from "hono";
import { bearerAuth } from "hono/bearer-auth";

const authEnabled = process.env.API_AUTH_ENABLED !== "false";
const apiToken = process.env.API_TOKEN;
if (authEnabled && !apiToken) {
  throw new Error("API_TOKEN is not defined in environment variables");
}

const bearerAuthHandler = apiToken ? bearerAuth({ token: apiToken }) : null;

export const authMiddleware = async (c: Context, next: Next) => {
  if (!authEnabled || !bearerAuthHandler) return next();
  if (c.req.method === "OPTIONS") {
    return next();
  }
  return bearerAuthHandler(c, next);
};
