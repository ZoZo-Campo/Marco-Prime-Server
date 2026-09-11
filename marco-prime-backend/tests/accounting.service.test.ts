import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  accountingService,
  accountingView,
} from "../src/services/accounting.service.js";

describe("AccountingService", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "marco-accounting-"));
    process.env.MARCO_DATA_DIR = directory;
    accountingService.resetForTests();
  });

  afterEach(async () => {
    accountingService.resetForTests();
    await rm(directory, { recursive: true, force: true });
  });

  it("stores measured liters and calculates simple totals without VAT", async () => {
    const saved = await accountingService.replace({
      eventName: "Soirée test",
      eventDate: "2030-01-01",
      rows: [
        {
          id: "f31efb78-158b-4f28-914f-8f42c86e98f9",
          label: "Primus",
          liters: "19.57",
          purchasePricePerLiter: "3.14",
          revenue: "63.80",
        },
        {
          id: "5c74c5c7-461e-41dc-a6e1-09c084b52a93",
          label: "Paix Dieu",
          liters: "24.2",
          purchasePricePerLiter: "6.17",
          revenue: "13.20",
        },
      ],
    });

    const view = accountingView(saved);
    expect(view.rows[0]?.cost).toBe("61.45");
    expect(view.rows[0]?.result).toBe("2.35");
    expect(view.totals.liters).toBe("43.77");
    expect(view.totals.cost).toBe("210.76");
    expect(view.totals.revenue).toBe("77.00");
    expect(view.totals.result).toBe("-133.76");

    accountingService.resetForTests();
    expect((await accountingService.get()).eventName).toBe("Soirée test");
    expect(JSON.parse(await readFile(path.join(directory, "accounting.json"), "utf8"))).not.toHaveProperty("vat");
  });
});
