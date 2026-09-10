import { testClient } from "hono/testing";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { db } from "../src/config/database.js";
import { members } from "../src/db/schema.js";
import { authenticatedOptions } from "./utils/helpers.js";

describe("Products Endpoint", () => {
  const client = testClient(app);
  let adminCardNumber: number;
  let memberCardNumber: number;

  beforeAll(async () => {
    const [admin] = await db
      .select({ cardNumber: members.cardNumber })
      .from(members)
      .where(eq(members.admin, true))
      .limit(1);
    const [member] = await db
      .select({ cardNumber: members.cardNumber })
      .from(members)
      .where(eq(members.admin, false))
      .limit(1);

    if (!admin?.cardNumber || !member?.cardNumber) {
      throw new Error("The product tests require admin and member demo cards");
    }
    adminCardNumber = admin.cardNumber;
    memberCardNumber = member.cardNumber;
  });

  it("should return list of products", async () => {
    const res = await client.api.v1.products.$get({}, authenticatedOptions);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);

    if (data.length > 0) {
      expect(data[0]).toHaveProperty("id");
      expect(data[0]).toHaveProperty("title");
      expect(data[0]).toHaveProperty("name");
      expect(data[0]).toHaveProperty("color");
      expect(data[0]).toHaveProperty("price");
      expect(data[0]).toHaveProperty("productTypeId");
      expect(data[0]).toHaveProperty("available");
    }
  });

  it("should return 401 without authentication", async () => {
    const res = await client.api.v1.products.$get();
    expect(res.status).toBe(401);
  });

  it("should return product types with available product counts", async () => {
    const res = await client.api.v1["product-types"].$get(
      {},
      authenticatedOptions,
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("id");
    expect(data[0]).toHaveProperty("type");
    expect(data[0]).toHaveProperty("productCount");
  });

  it("should return paginated available products for a type", async () => {
    const typesRes = await client.api.v1["product-types"].$get(
      {},
      authenticatedOptions,
    );
    const types = await typesRes.json();
    const type = types.find((item) => item.productCount > 0);
    expect(type).toBeDefined();
    if (!type) throw new Error("No product type with available products");

    const res = await client.api.v1.products[":product_type_id"].$get(
      {
        param: { product_type_id: type.id.toString() },
        query: { page: "1", limit: "9" },
      },
      authenticatedOptions,
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.limit).toBe(9);
    expect(data.pagination.total).toBe(type.productCount);
    expect(data.data.every((product) => product.available)).toBe(true);
    expect(
      data.data.every((product) => product.productTypeId === type.id),
    ).toBe(true);
  });

  it("should reject invalid product pagination", async () => {
    const res = await client.api.v1.products[":product_type_id"].$get(
      {
        param: { product_type_id: "1" },
        query: { page: "0", limit: "9" },
      },
      authenticatedOptions,
    );
    expect(res.status).toBe(400);
  });

  it("should expose the local Marco selection", async () => {
    const res = await client.api.v1["catalog-selection"].$get(
      {},
      authenticatedOptions,
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("productType");
    expect(data[0]).toHaveProperty("enabledOnMarco");
  });

  it("should require an administrator to save the selection", async () => {
    const res = await client.api.v1["catalog-selection"].$put(
      {
        json: { adminCardNumber: memberCardNumber, productIds: [] },
      },
      authenticatedOptions,
    );
    expect(res.status).toBe(403);
  });

  it("should save the current selection with an administrator card", async () => {
    const currentRes = await client.api.v1["catalog-selection"].$get(
      {},
      authenticatedOptions,
    );
    const current = await currentRes.json();
    const productIds = current
      .filter((product) => product.enabledOnMarco)
      .map((product) => product.id);

    const res = await client.api.v1["catalog-selection"].$put(
      { json: { adminCardNumber, productIds } },
      authenticatedOptions,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      selectedCount: productIds.length,
    });
  });
});
