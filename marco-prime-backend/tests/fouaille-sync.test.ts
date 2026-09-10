import { describe, expect, it } from "vitest";
import { parseFouailleCatalog } from "../src/services/fouaille-sync.service.js";

describe("Fouaille catalog contract", () => {
  it("accepts the official product payload shape", () => {
    const catalog = parseFouailleCatalog({
      data: [
        {
          id: 3,
          product_type: "soft",
          products: [
            {
              id: 248,
              name: "CocaCola",
              title: "Coca",
              price: "1.00",
              color: "#b51a00",
            },
          ],
        },
      ],
    });

    expect(catalog.data[0]?.products[0]?.id).toBe(248);
  });

  it("rejects an incomplete payload before touching the database", () => {
    expect(() =>
      parseFouailleCatalog({
        data: [{ id: 3, product_type: "soft", products: [{ id: 248 }] }],
      }),
    ).toThrow();
  });
});
