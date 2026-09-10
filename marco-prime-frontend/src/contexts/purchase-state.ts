import { computed, signal } from "@preact/signals";

export type PendingPurchase = {
  transactionId: string;
  cardNumber: number;
  items: Array<{
    productId: number;
    amount: number;
  }>;
};

export const purchaseInProgressSignal = signal(false);
export const pendingPurchaseSignal = signal<PendingPurchase | null>(null);
export const purchaseErrorSignal = signal<string | null>(null);

export const purchaseInteractionLockedSignal = computed(
  () =>
    purchaseInProgressSignal.value || pendingPurchaseSignal.value !== null,
);

export function resetPurchaseState() {
  if (purchaseInProgressSignal.value) return;
  pendingPurchaseSignal.value = null;
  purchaseErrorSignal.value = null;
}
