export type BeerSaleFormat = "unit" | "25cl" | "33cl" | "50cl" | "60cl";
export type BeerContainer = "keg" | "bottle";

export interface BeerPriceReference {
  name: string;
  aliases?: string[];
  container: BeerContainer;
  purchasePrice: string;
  salePrices: Partial<Record<BeerSaleFormat, string>>;
}

export const SALE_FORMAT_LITERS: Record<Exclude<BeerSaleFormat, "unit">, number> = {
  "25cl": 0.25,
  "33cl": 0.33,
  "50cl": 0.5,
  "60cl": 0.6,
};

export const BEER_PRICE_REFERENCES: BeerPriceReference[] = [
  {
    name: "3 monts fond de cale",
    container: "keg",
    purchasePrice: "4.02",
    salePrices: { "25cl": "2.21", "33cl": "2.25", "50cl": "4.02", "60cl": "4.10" },
  },
  {
    name: "Bière du sorcier",
    container: "keg",
    purchasePrice: "3.87",
    salePrices: { "25cl": "2.13", "33cl": "2.15", "50cl": "3.87", "60cl": "3.90" },
  },
  {
    name: "Brooklyn pulp art",
    container: "keg",
    purchasePrice: "4.81",
    salePrices: { "25cl": "2.65", "33cl": "2.65", "50cl": "4.81", "60cl": "4.90" },
  },
  {
    name: "Charles quint",
    container: "keg",
    purchasePrice: "4.29",
    salePrices: { "25cl": "2.36", "33cl": "2.40", "50cl": "4.29", "60cl": "4.30" },
  },
  {
    name: "Cidre",
    container: "keg",
    purchasePrice: "4.57",
    salePrices: { "25cl": "2.51", "33cl": "2.55", "50cl": "4.57", "60cl": "4.60" },
  },
  {
    name: "Colomba",
    container: "keg",
    purchasePrice: "4.66",
    salePrices: { "25cl": "2.56", "33cl": "2.60", "50cl": "4.66", "60cl": "4.70" },
  },
  {
    name: "Fisher ambré",
    container: "keg",
    purchasePrice: "4.45",
    salePrices: { "25cl": "2.45", "33cl": "2.45", "50cl": "4.45", "60cl": "4.50" },
  },
  {
    name: "Kasteel Red",
    container: "keg",
    purchasePrice: "4.57",
    salePrices: { "25cl": "2.51", "33cl": "2.55", "50cl": "4.57", "60cl": "4.60" },
  },
  {
    name: "Kasteel Rubus",
    container: "keg",
    purchasePrice: "4.67",
    salePrices: { "25cl": "2.57", "33cl": "2.60", "50cl": "4.67", "60cl": "4.70" },
  },
  {
    name: "Kasteel Tropical",
    container: "keg",
    purchasePrice: "4.57",
    salePrices: { "25cl": "2.51", "33cl": "2.55", "50cl": "4.57", "60cl": "4.60" },
  },
  {
    name: "Krombacher",
    container: "keg",
    purchasePrice: "2.40",
    salePrices: { "25cl": "1.32", "33cl": "1.35", "50cl": "2.40", "60cl": "2.40" },
  },
  {
    name: "Licorne black",
    container: "keg",
    purchasePrice: "4.28",
    salePrices: { "25cl": "2.35", "33cl": "2.40", "50cl": "4.28", "60cl": "4.30" },
  },
  {
    name: "Meteor cerise",
    container: "keg",
    purchasePrice: "4.44",
    salePrices: { "25cl": "2.44", "33cl": "2.45", "50cl": "4.44", "60cl": "4.50" },
  },
  {
    name: "Meteor hefeweizen",
    container: "keg",
    purchasePrice: "3.91",
    salePrices: { "25cl": "2.15", "33cl": "2.20", "50cl": "3.91", "60cl": "4.00" },
  },
  {
    name: "Meteor IPA",
    container: "keg",
    purchasePrice: "4.25",
    salePrices: { "25cl": "2.34", "33cl": "2.35", "50cl": "4.25", "60cl": "4.30" },
  },
  {
    name: "Meteor triple",
    container: "keg",
    purchasePrice: "4.72",
    salePrices: { "25cl": "2.60", "33cl": "2.60", "50cl": "4.72", "60cl": "4.80" },
  },
  {
    name: "Orange mécanique",
    container: "keg",
    purchasePrice: "4.50",
    salePrices: { "25cl": "2.47", "33cl": "2.50", "50cl": "4.50", "60cl": "4.50" },
  },
  {
    name: "Paix dieu",
    container: "keg",
    purchasePrice: "5.14",
    salePrices: { "25cl": "2.83", "33cl": "2.60", "50cl": "5.14", "60cl": "4.30" },
  },
  {
    name: "Perle Florale",
    container: "keg",
    purchasePrice: "4.12",
    salePrices: { "25cl": "2.27", "33cl": "2.30", "50cl": "4.12", "60cl": "4.20" },
  },
  {
    name: "Perle Rosée",
    container: "keg",
    purchasePrice: "4.53",
    salePrices: { "25cl": "2.49", "33cl": "2.50", "50cl": "4.53", "60cl": "4.60" },
  },
  {
    name: "Primus",
    container: "keg",
    purchasePrice: "2.62",
    salePrices: { "25cl": "1.44", "33cl": "1.50", "50cl": "2.62", "60cl": "2.70" },
  },
  {
    name: "Slash mango",
    aliases: ["Slash Mangue"],
    container: "keg",
    purchasePrice: "4.64",
    salePrices: { "25cl": "2.55", "33cl": "2.60", "50cl": "4.64", "60cl": "4.70" },
  },
  {
    name: "Stuut juicy dolly",
    container: "keg",
    purchasePrice: "5.12",
    salePrices: { "25cl": "2.81", "33cl": "2.85", "50cl": "5.12", "60cl": "5.20" },
  },
  {
    name: "Super 8 blanche",
    container: "keg",
    purchasePrice: "3.44",
    salePrices: { "25cl": "1.89", "33cl": "1.90", "50cl": "3.44", "60cl": "3.50" },
  },
  {
    name: "Super 8 IPA",
    container: "keg",
    purchasePrice: "4.07",
    salePrices: { "25cl": "2.24", "33cl": "2.25", "50cl": "4.07", "60cl": "4.10" },
  },
  {
    name: "Super 8 rouge",
    container: "keg",
    purchasePrice: "4.63",
    salePrices: { "25cl": "2.55", "33cl": "2.55", "50cl": "4.63", "60cl": "4.70" },
  },
  {
    name: "Barbar",
    aliases: ["Barbare"],
    container: "bottle",
    purchasePrice: "1.47",
    salePrices: { unit: "2.00" },
  },
  {
    name: "Bene",
    aliases: ["Benediktiner"],
    container: "bottle",
    purchasePrice: "1.33",
    salePrices: { unit: "1.80" },
  },
  {
    name: "Bière du sorcier verte",
    container: "bottle",
    purchasePrice: "2.02",
    salePrices: { unit: "2.70" },
  },
  {
    name: "Bitburger",
    container: "bottle",
    purchasePrice: "0.87",
    salePrices: { unit: "1.20" },
  },
  {
    name: "Bon secours myrtille",
    container: "bottle",
    purchasePrice: "1.80",
    salePrices: { unit: "2.40" },
  },
  {
    name: "Chimay Bleue",
    container: "bottle",
    purchasePrice: "1.71",
    salePrices: { unit: "2.30" },
  },
  {
    name: "Chouffe",
    container: "bottle",
    purchasePrice: "1.85",
    salePrices: { unit: "2.50" },
  },
  {
    name: "Corona",
    container: "bottle",
    purchasePrice: "1.72",
    salePrices: { unit: "2.30" },
  },
  {
    name: "Deli",
    container: "bottle",
    purchasePrice: "1.73",
    salePrices: { unit: "2.30" },
  },
  {
    name: "Dono raddler",
    container: "bottle",
    purchasePrice: "0",
    salePrices: { unit: "0" },
  },
  {
    name: "Duvel",
    container: "bottle",
    purchasePrice: "1.95",
    salePrices: { unit: "2.60" },
  },
  {
    name: "Kasteel Red",
    container: "bottle",
    purchasePrice: "1.77",
    salePrices: { unit: "2.40" },
  },
  {
    name: "Kasteel Rubus",
    container: "bottle",
    purchasePrice: "1.78",
    salePrices: { unit: "2.40" },
  },
  {
    name: "Karmeliet triple",
    aliases: ["Tripel Karmeliet"],
    container: "bottle",
    purchasePrice: "2.26",
    salePrices: { unit: "3.00" },
  },
  {
    name: "Kasteel triple",
    container: "bottle",
    purchasePrice: "1.82",
    salePrices: { unit: "2.50" },
  },
  {
    name: "Kronenbourg",
    container: "bottle",
    purchasePrice: "0",
    salePrices: { unit: "0" },
  },
  {
    name: "Kwak",
    container: "bottle",
    purchasePrice: "1.80",
    salePrices: { unit: "2.40" },
  },
  {
    name: "perles pils",
    aliases: ["Perle pils"],
    container: "bottle",
    purchasePrice: "1.85",
    salePrices: { unit: "2.50" },
  },
  {
    name: "perle rosée",
    aliases: ["Perles rosee"],
    container: "bottle",
    purchasePrice: "2.23",
    salePrices: { unit: "3.00" },
  },
  {
    name: "Licorne black",
    container: "bottle",
    purchasePrice: "1.79",
    salePrices: { unit: "2.40" },
  },
  {
    name: "Meteor cerise",
    container: "bottle",
    purchasePrice: "1.72",
    salePrices: { unit: "2.30" },
  },
  {
    name: "Mystic",
    container: "bottle",
    purchasePrice: "1.08",
    salePrices: { unit: "1.50" },
  },
  {
    name: "Perle blanche",
    container: "bottle",
    purchasePrice: "1.85",
    salePrices: { unit: "2.50" },
  },
  {
    name: "Perle IPA",
    container: "bottle",
    purchasePrice: "2.19",
    salePrices: { unit: "2.90" },
  },
  {
    name: "Perles des vignes",
    container: "bottle",
    purchasePrice: "2.45",
    salePrices: { unit: "3.30" },
  },
  {
    name: "Rothaus",
    container: "bottle",
    purchasePrice: "1.05",
    salePrices: { unit: "1.40" },
  },
];

function normalizeBeerName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bbouteilles?\b/gi, " ")
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ")
    .trim();
}

function beerFamilyName(value: string) {
  return normalizeBeerName(value)
    .replace(/\b(?:25|33|50|60)\s*c?l\b/g, "")
    .replace(/\b(?:demi|pinte)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findBeerPriceReference(
  productName: string,
  container: BeerContainer,
) {
  const key = container === "keg"
    ? beerFamilyName(productName)
    : normalizeBeerName(productName);
  return BEER_PRICE_REFERENCES.find((reference) =>
    reference.container === container &&
    [reference.name, ...(reference.aliases ?? [])].some(
      (name) => normalizeBeerName(name) === key,
    ),
  );
}

export function beerFormatFromProductName(
  productName: string,
): Exclude<BeerSaleFormat, "unit"> {
  const name = normalizeBeerName(productName);
  if (/\b25\s*cl\b/.test(name)) return "25cl";
  if (/\b33\s*cl\b/.test(name)) return "33cl";
  if (/\b60\s*cl\b/.test(name)) return "60cl";
  return "50cl";
}
