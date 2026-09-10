const PALETTE = [
  { name: "red", hex: "#FFACAC" },
  { name: "green", hex: "#D8E9AB" },
  { name: "blue", hex: "#D3D2FF" },
  { name: "pink", hex: "#E1A7D9" },
  { name: "yellow", hex: "#FFE284" },
  { name: "cyan", hex: "#AAE6E5" },
  { name: "purple", hex: "#DAABF5" },
  { name: "orange", hex: "#FFB98E" },
];

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

function hexToRgb(hex: string): RgbColor {
  const h = hex.replace("#", "").trim();

  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);

  return { r, g, b };
}

function rgbDistance(a: RgbColor, b: RgbColor) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function closestColor(color: string) {
  const normalized = color.trim().toLowerCase();
  const namedColor = PALETTE.find(({ name }) => name === normalized);
  if (namedColor) return namedColor.hex;

  const shortHex = normalized.match(/^#?([0-9a-f]{3})$/)?.[1];
  const longHex = normalized.match(/^#?([0-9a-f]{6})$/)?.[1];
  const validHex = longHex ?? shortHex?.replace(/./g, (digit) => digit + digit);

  // Fouaille fournit normalement une couleur hexadécimale. Les anciennes bases
  // de démonstration contiennent parfois un nom CSS ou une valeur vide : une
  // couleur de repli doit alors préserver l'affichage au lieu de planter l'IHM.
  if (!validHex) return PALETTE[2].hex;

  const rgb = hexToRgb(validHex);
  let best = null;
  let bestDist = Infinity;
  for (const p of PALETTE) {
    const prgb = hexToRgb(p.hex);
    const dist = rgbDistance(rgb, prgb);

    if (dist < bestDist) {
      bestDist = dist;
      best = p.hex;
    }
  }
  return best ?? PALETTE[2].hex;
}
