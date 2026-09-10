import { testClient } from "hono/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import {
  authenticatedOptions,
  getAdminCardNumber,
  getNonAdminCardNumber,
} from "./utils/helpers.js";

describe("Wi-Fi control endpoints", () => {
  const client = testClient(app);
  let adminCardNumber: number;
  let memberCardNumber: number;

  beforeAll(async () => {
    adminCardNumber = await getAdminCardNumber();
    memberCardNumber = await getNonAdminCardNumber();
  });

  it("refuses a non-administrator", async () => {
    const response = await client.api.v1.system.wifi.scan.$post(
      { json: { adminCardNumber: memberCardNumber } },
      authenticatedOptions,
    );
    expect(response.status).toBe(403);
  });

  it("reports an unavailable host helper without escalating privileges", async () => {
    const response = await client.api.v1.system.wifi.scan.$post(
      { json: { adminCardNumber } },
      authenticatedOptions,
    );
    expect(response.status).toBe(503);
  });

  it("rejects an invalid Wi-Fi password before contacting the helper", async () => {
    const response = await client.api.v1.system.wifi.connect.$post(
      { json: { adminCardNumber, ssid: "Test", password: "short" } },
      authenticatedOptions,
    );
    expect(response.status).toBe(400);
  });
});
