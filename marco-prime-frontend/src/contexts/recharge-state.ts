import { computed, signal } from "@preact/signals";

export type PendingRecharge = {
  transactionId: string;
  cardNumber: number;
  adminCardNumber?: number;
  amount: number;
};

export const rechargeAmountSignal = signal("");
export const rechargeInProgressSignal = signal(false);
export const waitingForAdminSignal = signal(false);
export const rechargeErrorSignal = signal<string | null>(null);
export const pendingRechargeSignal = signal<PendingRecharge | null>(null);

export const rechargeInteractionLockedSignal = computed(
  () =>
    rechargeInProgressSignal.value ||
    waitingForAdminSignal.value ||
    pendingRechargeSignal.value !== null,
);

export function resetRechargeState() {
  if (rechargeInProgressSignal.value) return;
  rechargeAmountSignal.value = "";
  waitingForAdminSignal.value = false;
  rechargeErrorSignal.value = null;
  pendingRechargeSignal.value = null;
}
