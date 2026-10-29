import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { swaggerUI } from "@hono/swagger-ui";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { customLogger } from "./config/logger.js";
import { openApiSpec } from "./config/openapi.js";
import { router } from "./config/router.js";
import { db } from "./config/database.js";
import { deploymentMode, envFileEditable } from "./config/deployment.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { adminSessionMiddleware } from "./middlewares/admin-session.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { limiter, sensitiveLimiter } from "./middlewares/rate-limiter.middleware.js";
import { cleanupIdempotencyKeys } from "./services/idempotency.service.js";
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
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Admin-Token",
      "X-Setup-Token",
    ],
    // Aucun cookie ni session de navigateur : inutile d'autoriser les
    // requêtes crédentialisées.
    credentials: false,
  }))
  .use("/api/v1/*", async (c, next) => {
    await next();
    // Les réponses contiennent des noms, des soldes et des historiques :
    // aucun proxy ou navigateur partagé ne doit les mettre en cache.
    c.header("Cache-Control", "no-store");
  })
  .use("/api/v1/*", bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: "Corps de requête trop volumineux" }, 413),
  }))
  .use("/api/v1/*", limiter)
  // Seules les routes qui vérifient ou modifient le mot de passe sont
  // limitées strictement. `status` est appelé à chaque chargement de page et
  // reste soumis à la limite générale.
  .use("/api/v1/config-auth/unlock", sensitiveLimiter)
  .use("/api/v1/config-auth/setup", sensitiveLimiter)
  .use("/api/v1/config-auth/password", sensitiveLimiter)
  .use("/api/v1/config-auth/disable", sensitiveLimiter)
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
  // Configuration lue par le frontend au chargement. Le jeton d'API n'est
  // JAMAIS exposé ici : en déploiement serveur, Caddy l'injecte vers l'API.
  // Le navigateur ne reçoit que l'URL et le mode de déploiement.
  .get("/runtime-config.js", (c) => {
    const configuration = {
      apiUrl: process.env.PUBLIC_API_URL || "/api/v1",
      deployment: deploymentMode(),
      // En mode serveur, Caddy ajoute le jeton : le frontend ne l'envoie pas.
      // Le kiosque statique renvoie false et utilise son jeton de build.
      apiTokenInjected: deploymentMode() === "server",
    };
    return c.body(
      `window.MARCO_CONFIG = ${JSON.stringify(configuration)};\n`,
      200,
      {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    );
  })
  .use("/api/v1/*", authMiddleware)
  .use("/api/v1/*", adminSessionMiddleware)
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

  // Les clés d'idempotence sont conservées 30 jours, puis purgées. Un échec
  // de purge ne doit jamais empêcher l'application de démarrer.
  void cleanupIdempotencyKeys().catch((error) => {
    console.error("Purge des clés d'idempotence impossible", error);
  });
  const idempotencyCleanup = setInterval(
    () => {
      void cleanupIdempotencyKeys().catch((error) => {
        console.error("Purge des clés d'idempotence impossible", error);
      });
    },
    6 * 60 * 60 * 1000,
  );
  idempotencyCleanup.unref();

  const hostname = process.env.API_HOST || "127.0.0.1";
  serve(
    {
      fetch: app.fetch,
      hostname,
      port: Number.parseInt(process.env.API_PORT || "3000"),
    },
    (info) => {
      console.log(`Server is running on http://${hostname}:${info.port}`);
      console.log(
        `Deployment mode: ${deploymentMode()} (env editable: ${envFileEditable()})`,
      );
    },
  );
}
