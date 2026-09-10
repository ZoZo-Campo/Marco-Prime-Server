import { testClient } from "hono/testing";
import { describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import {
  authenticatedOptions,
  getNonAdminCardNumber,
} from "./utils/helpers.js";

describe("Member Endpoint", async () => {
  const client = testClient(app);
  const adminNumber = await getNonAdminCardNumber();

  it("should return member data for valid card number", async () => {
    const res = await client.api.v1.member[":card_number"].$get(
      { param: { card_number: adminNumber.toString() } },
      authenticatedOptions,
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("firstName");
    expect(data).toHaveProperty("lastName");
    expect(data).toHaveProperty("cardNumber");
    expect(data).toHaveProperty("balance");
    expect(data).toHaveProperty("admin");
  });

  it("should return 404 for non-existent card number", async () => {
    const res = await client.api.v1.member[":card_number"].$get(
      { param: { card_number: "999999" } },
      authenticatedOptions,
    );
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("should return 401 without authentication", async () => {
    const res = await client.api.v1.member[":card_number"].$get({
      param: { card_number: adminNumber.toString() },
    });
    expect(res.status).toBe(401);
  });
});
