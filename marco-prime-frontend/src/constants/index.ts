export const MAX_CARD_NUMBER_DIGITS = 10;

export function isValidCardNumber(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_CARD_NUMBER_DIGITS &&
    /^\d+$/.test(value)
  );
}

export const PRODUCT_FETCH_LIMIT = 100;
export const PRODUCT_PRICE_REFRESH_INTERVAL_MS = 5_000;
export const PRODUCT_GRID_PLACEHOLDER_COUNT = 12;
export const HISTORY_BATCH_SIZE = 50;
export const HISTORY_SKELETON_COUNT = 12;
