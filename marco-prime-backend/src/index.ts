import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { swaggerUI } from "@hono/swagger-ui";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { customLogger } from "./config/logger.js";
import { openApiSpec } from "./config/openapi.js";
import { router } from "./config/router.js";
import { db } from "./config/database.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { limiter } from "./middlewares/rate-limiter.middleware.js";
import { startFouailleSynchronization } from "./services/fouaille-sync.service.js";

const allowedFrontendOrigins = (
  process.env.FRONTEND_URL ||
  "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const app = new Hono()
  .onError(errorHandler)
  .use("*", logger(customLogger))
  .use("*", cors({
    origin: allowedFrontendOrigins,
    credentials: true,
  }))
  .use("/api/v1/*", limiter)
  .get("/health", (c) =>
    c.json({
      status: "ok",
    }),
  )
  .get("/ready", async (c) => {
    await db.execute(sql`SELECT 1`);
    return c.json({ status: "ready" });
  })
  .get("/doc", (c) => c.json(openApiSpec))
  .get("/ui", swaggerUI({ url: "/doc" }))
  .use("/api/v1/*", authMiddleware)
  .route("/api/v1", router);

if (process.env.NODE_ENV !== "production") {
  app.get("/", (c) => c.redirect("/ui"));
}

if (process.env.NODE_ENV === "production") {
  app.use("/assets/*", serveStatic({ root: "./public" }));
  app.use("/*", serveStatic({ root: "./public" }));
  app.get("*", serveStatic({ path: "./public/index.html" }));
}

if (process.env.NODE_ENV !== "test") {
  startFouailleSynchronization();
  serve(
    {
      fetch: app.fetch,
      port: Number.parseInt(process.env.API_PORT || "3000"),
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
    },
  );
}
