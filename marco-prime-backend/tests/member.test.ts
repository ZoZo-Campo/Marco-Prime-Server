import { testClient } from "hono/testing";
import { describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import {
  authenticatedOptions,
  getAdminCardNumber,
  getNonAdminCardNumber,
} from "./utils/helpers.js";

describe("Member Endpoint", async () => {
  const client = testClient(app);
  const memberNumber = await getNonAdminCardNumber();

  it("should return member data for valid card number", async () => {
    const res = await client.api.v1.member[":card_number"].$get(
      { param: { card_number: memberNumber.toString() } },
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
      param: { card_number: memberNumber.toString() },
    });
    expect(res.status).toBe(401);
  });

  it("allows an administrator to search a member by name", async () => {
    const adminCardNumber = await getAdminCardNumber();
    const memberResponse = await client.api.v1.member[":card_number"].$get(
      { param: { card_number: memberNumber.toString() } },
      authenticatedOptions,
    );
    const member = await memberResponse.json();
    const query = member.lastName.length >= 2 ? member.lastName : member.firstName;
    const response = await client.api.v1.members.search.$post(
      {
        json: {
          adminCardNumber,
          query,
        },
      },
      authenticatedOptions,
    );

    expect(response.status).toBe(200);
    const results = await response.json();
    expect(results.some((result) => result.cardNumber === memberNumber)).toBe(true);
  });

  it("allows kiosk member search without an administrator card", async () => {
    const response = await client.api.v1.members.search.$post(
      { json: { query: "test" } },
      authenticatedOptions,
    );
    expect(response.status).toBe(200);
  });
});
