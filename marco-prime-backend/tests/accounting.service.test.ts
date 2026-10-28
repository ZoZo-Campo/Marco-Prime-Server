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
      status: "draft",
      eventName: "Soirée test",
      eventDate: "2030-01-01",
      rows: [
        {
          id: "f31efb78-158b-4f28-914f-8f42c86e98f9",
          productId: 1,
          label: "Primus",
          liters: "19.57",
          purchasePricePerLiter: "3.14",
          revenue: "63.80",
        },
        {
          id: "5c74c5c7-461e-41dc-a6e1-09c084b52a93",
          productId: 2,
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
    expect(view.rows[0]?.saleFormat).toBe("unit");
    expect(view.rows[0]?.expectedRevenue).toBe("0.00");
    expect(view.totals.liters).toBe("43.77");
    expect(view.totals.cost).toBe("210.76");
    expect(view.totals.revenue).toBe("77.00");
    expect(view.totals.expectedRevenue).toBe("0.00");
    expect(view.totals.variance).toBe("77.00");
    expect(view.totals.result).toBe("-133.76");
    expect(view.productDefaults).toEqual([
      { productId: 1, purchasePricePerLiter: "3.14" },
      { productId: 2, purchasePricePerLiter: "6.17" },
    ]);

    accountingService.resetForTests();
    expect((await accountingService.get()).eventName).toBe("Soirée test");
    expect(JSON.parse(await readFile(path.join(directory, "accounting.json"), "utf8"))).not.toHaveProperty("vat");
  });

  it("stores the event start and end times", async () => {
    const saved = await accountingService.replace({
      status: "draft",
      eventName: "Soirée horaires",
      eventDate: "2030-04-01",
      eventStartTime: "18:30",
      eventEndTime: "01:15",
      rows: [],
    });
    expect(saved.eventStartTime).toBe("18:30");
    expect(saved.eventEndTime).toBe("01:15");

    accountingService.resetForTests();
    const reopened = await accountingService.get();
    expect(reopened.eventStartTime).toBe("18:30");
    expect(reopened.eventEndTime).toBe("01:15");
  });

  it("keeps positive per-liter prices for future events in the same file", async () => {
    await accountingService.replace({
      status: "draft",
      eventName: "Première soirée",
      eventDate: "2030-01-01",
      rows: [
        {
          id: "f31efb78-158b-4f28-914f-8f42c86e98f9",
          productId: 1,
          label: "Primus",
          liters: "10",
          purchasePricePerLiter: "3.14",
          revenue: "40",
        },
      ],
    });

    const next = await accountingService.replace({
      status: "draft",
      eventName: "Soirée suivante",
      eventDate: "2030-02-01",
      rows: [
        {
          id: "5c74c5c7-461e-41dc-a6e1-09c084b52a93",
          productId: 1,
          label: "Primus",
          liters: "0",
          purchasePricePerLiter: "0",
          revenue: "0",
        },
      ],
    });

    expect(next.productDefaults).toEqual([
      { productId: 1, purchasePricePerLiter: "3.14" },
    ]);
    expect(
      await readFile(path.join(directory, "accounting.json"), "utf8"),
    ).toContain('"productDefaults"');
  });

  it("serializes concurrent saves without losing prior defaults", async () => {
    const first = accountingService.replace({
      status: "draft",
      eventName: "Première soirée",
      eventDate: "2030-05-01",
      rows: [
        {
          id: "f31efb78-158b-4f28-914f-8f42c86e98f9",
          productId: 1,
          label: "Primus",
          liters: "10",
          purchasePricePerLiter: "3.14",
          revenue: "40",
        },
      ],
    });
    const second = accountingService.replace({
      status: "draft",
      eventName: "Deuxième soirée",
      eventDate: "2030-05-02",
      rows: [],
    });

    await Promise.all([first, second]);
    const saved = await accountingService.get();
    expect(saved.eventName).toBe("Deuxième soirée");
    expect(saved.productDefaults).toEqual([
      { productId: 1, purchasePricePerLiter: "3.14" },
    ]);
  });

  it("counts a single real quantity when liters and units are both present", async () => {
    const saved = await accountingService.replace({
      status: "draft",
      eventName: "Soirée bouteilles",
      eventDate: "2030-06-01",
      rows: [
        {
          id: "7b97f2fc-6eab-4f43-9b9c-7e4f3d7c8a11",
          productId: 9,
          label: "Bouteille",
          liters: "3",
          units: "4",
          purchasePricePerLiter: "2.50",
          revenue: "20",
          salePrice: "2.50",
        },
      ],
    });

    const view = accountingView(saved);
    expect(view.rows[0]?.cost).toBe("10.00");
    expect(view.rows[0]?.expectedRevenue).toBe("10.00");
    expect(view.rows[0]?.variance).toBe("10.00");
    expect(view.rows[0]?.result).toBe("10.00");
    expect(view.totals.cost).toBe("10.00");
    expect(view.totals.units).toBe("4");
  });

  it("computes the expected revenue of a keg from its serving format", async () => {
    const saved = await accountingService.replace({
      status: "draft",
      eventName: "Soirée fût",
      eventDate: "2030-06-02",
      rows: [
        {
          id: "be2f6a3e-1b5a-4f77-9f6c-0f8f2d7a1c34",
          productId: 1,
          label: "Primus 25cl",
          liters: "10",
          purchasePricePerLiter: "3.14",
          revenue: "70",
          salePrice: "2.00",
          saleFormat: "25cl",
        },
      ],
    });

    const view = accountingView(saved);
    expect(view.rows[0]?.cost).toBe("31.40");
    expect(view.rows[0]?.expectedRevenue).toBe("80.00");
    expect(view.rows[0]?.variance).toBe("-10.00");
    expect(view.rows[0]?.result).toBe("38.60");
    expect(view.totals.expectedRevenue).toBe("80.00");
    expect(view.totals.variance).toBe("-10.00");
  });

  it("computes the expected revenue of unit products", async () => {
    const saved = await accountingService.replace({
      status: "draft",
      eventName: "Soirée bouteilles",
      eventDate: "2030-06-03",
      rows: [
        {
          id: "7b97f2fc-6eab-4f43-9b9c-7e4f3d7c8a12",
          productId: 257,
          label: "Benediktiner",
          liters: "0",
          units: "4",
          purchasePricePerLiter: "1.33",
          revenue: "9",
          salePrice: "2.50",
          saleFormat: "unit",
        },
      ],
    });

    const view = accountingView(saved);
    expect(view.rows[0]?.cost).toBe("5.32");
    expect(view.rows[0]?.expectedRevenue).toBe("10.00");
    expect(view.rows[0]?.variance).toBe("-1.00");
    expect(view.rows[0]?.result).toBe("3.68");
    expect(view.totals.units).toBe("4");
  });

  it("records closure and can reopen an event without losing its rows", async () => {
    const input = {
      eventName: "Soirée à clôturer",
      eventDate: "2030-03-01",
      rows: [
        {
          id: "f31efb78-158b-4f28-914f-8f42c86e98f9",
          productId: 1,
          label: "Primus",
          liters: "10",
          purchasePricePerLiter: "3.14",
          revenue: "40",
        },
      ],
    };

    const closed = await accountingService.replace({
      ...input,
      status: "closed",
    });
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).not.toBeNull();

    const reopened = await accountingService.replace({
      ...input,
      status: "draft",
    });
    expect(reopened.status).toBe("draft");
    expect(reopened.closedAt).toBeNull();
    expect(reopened.rows).toHaveLength(1);
  });
});
