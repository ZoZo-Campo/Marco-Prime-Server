import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configAuthService } from "../src/services/config-auth.service.js";

describe("ConfigAuthService corrupt file handling", () => {
  let directory: string;
  let target: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "marco-config-auth-"));
    process.env.MARCO_DATA_DIR = directory;
    target = path.join(directory, "config-auth.json");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("quarantines an invalid file instead of silently ignoring it", async () => {
    await writeFile(target, "{not-json", "utf8");

    await expect(configAuthService.status()).rejects.toThrow(
      "CONFIG_AUTH_FILE_CORRUPT",
    );

    const entries = await readdir(directory);
    const quarantine = entries.find((name) =>
      name.startsWith("config-auth.json.corrupt-"),
    );
    if (!quarantine) throw new Error("Corrupt config file was not quarantined");

    expect(await readFile(path.join(directory, quarantine), "utf8")).toBe(
      "{not-json",
    );
    await expect(readFile(target, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(configAuthService.status()).resolves.toEqual({
      configured: false,
      updatedAt: null,
    });
  });

  it("refuses to overwrite a corrupt password file", async () => {
    await writeFile(target, '{"version":1}', "utf8");

    await expect(
      configAuthService.setPassword(1234, "motdepasse"),
    ).rejects.toThrow("CONFIG_AUTH_FILE_CORRUPT");

    const entries = await readdir(directory);
    expect(
      entries.some((name) => name.startsWith("config-auth.json.corrupt-")),
    ).toBe(true);
    await expect(configAuthService.status()).resolves.toEqual({
      configured: false,
      updatedAt: null,
    });
  });
});
