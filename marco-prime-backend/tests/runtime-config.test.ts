import { afterEach, describe, expect, it } from "vitest";
import { app } from "../src/index.js";

const initialDeployment = process.env.MARCO_DEPLOYMENT;

afterEach(() => {
  if (initialDeployment === undefined) {
    delete process.env.MARCO_DEPLOYMENT;
  } else {
    process.env.MARCO_DEPLOYMENT = initialDeployment;
  }
});

describe("Runtime configuration", () => {
  it("never exposes the API token", async () => {
    const response = await app.request("/runtime-config.js");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain(
      "application/javascript",
    );
    const body = await response.text();
    expect(body).toContain("window.MARCO_CONFIG");
    expect(body).not.toContain(process.env.API_TOKEN!);
    expect(body).not.toContain('"apiToken":');
    expect(body).not.toContain('"apiToken" :');
  });

  it("marks token injection in server mode", async () => {
    process.env.MARCO_DEPLOYMENT = "server";

    const body = await (await app.request("/runtime-config.js")).text();

    expect(body).toContain('"deployment":"server"');
    expect(body).toContain('"apiTokenInjected":true');
    expect(body).not.toContain(process.env.API_TOKEN!);
  });

  it("keeps the build token path for a standalone kiosk", async () => {
    process.env.MARCO_DEPLOYMENT = "local";

    const body = await (await app.request("/runtime-config.js")).text();

    expect(body).toContain('"deployment":"local"');
    expect(body).toContain('"apiTokenInjected":false');
  });
});
