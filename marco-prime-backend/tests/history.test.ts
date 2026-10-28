import { testClient } from "hono/testing";
import { describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { authenticatedOptions } from "./utils/helpers.js";

describe("History Endpoint", () => {
  const client = testClient(app);

  it("should return paginated order history with default values", async () => {
    const res = await client.api.v1.history.$get(
      { query: {} },
      authenticatedOptions,
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("data");
    expect(data).toHaveProperty("pagination");
    expect(Array.isArray(data.data)).toBe(true);

    expect(data.pagination).toHaveProperty("page");
    expect(data.pagination).toHaveProperty("limit");
    expect(data.pagination).toHaveProperty("total");
    expect(data.pagination).toHaveProperty("totalPages");

    if (data.data.length > 0) {
      expect(data.data[0]).toMatchObject({
        id: expect.any(Number),
        price: expect.any(String),
        amount: expect.any(Number),
        date: expect.any(String),
      });
      expect(data.data[0]).toHaveProperty("product");
      expect(data.data[0]).toHaveProperty("member");
      if (data.data[0].product) {
        expect(data.data[0].product).toMatchObject({
          id: expect.any(Number),
          name: expect.any(String),
        });
      }
      if (data.data[0].member) {
        expect(data.data[0].member).toMatchObject({
          id: expect.any(Number),
          firstName: expect.any(String),
          lastName: expect.any(String),
          balance: expect.any(String),
        });
      }
    }
  });

  it("should return paginated order history with custom pagination", async () => {
    const res = await client.api.v1.history.$get(
      { query: { page: "2", limit: "5" } },
      authenticatedOptions,
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.pagination.page).toBe(2);
    expect(data.pagination.limit).toBe(5);
  });

  it("should return 401 without authentication", async () => {
    const res = await client.api.v1.history.$get({ query: {} });
    expect(res.status).toBe(401);
  });

  it("should return 400 for invalid pagination parameters", async () => {
    const res = await client.api.v1.history.$get(
      { query: { page: "0", limit: "5" } },
      authenticatedOptions,
    );
    expect(res.status).toBe(400);
  });

  it("filters history by transaction number", async () => {
    const initial = await client.api.v1.history.$get(
      { query: { limit: "1" } },
      authenticatedOptions,
    );
    const first = (await initial.json()).data[0];
    if (!first) return;

    const response = await client.api.v1.history.$get(
      { query: { search: String(first.id), limit: "20" } },
      authenticatedOptions,
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.some((order) => order.id === first.id)).toBe(true);
  });

  it("rejects an inverted history date range", async () => {
    const response = await client.api.v1.history.$get(
      {
        query: {
          from: "2030-01-02T00:00:00.000Z",
          to: "2030-01-01T00:00:00.000Z",
        },
      },
      authenticatedOptions,
    );
    expect(response.status).toBe(400);
  });
});
