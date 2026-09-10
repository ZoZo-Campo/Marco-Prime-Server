import { testClient } from "hono/testing";
import { describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { authenticatedOptions } from "./utils/helpers.js";

describe("System status endpoint", () => {
  const client = testClient(app);

  it("reports the backend and test database status", async () => {
    const response = await client.api.v1.system.status.$get(
      {},
      authenticatedOptions,
    );

    expect(response.status).toBe(200);
    const status = await response.json();
    expect(status.backend.available).toBe(true);
    expect(status.database.available).toBe(true);
    expect(status.database.latencyMs).toEqual(expect.any(Number));
    expect(status.fouaille.available).toBe(false);
  });

  it("requires API authentication when enabled", async () => {
    const response = await client.api.v1.system.status.$get({});
    expect(response.status).toBe(401);
  });
});
