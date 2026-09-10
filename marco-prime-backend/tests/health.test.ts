import { testClient } from "hono/testing";
import { describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { authenticatedOptions } from "./utils/helpers.js";

describe("Health Endpoint", () => {
  const client = testClient(app);

  it("should return 200 OK with status", async () => {
    const res = await client.health.$get({}, authenticatedOptions);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });

  it("should work without authentication", async () => {
    const res = await client.health.$get();
    expect(res.status).toBe(200);
  });
});
