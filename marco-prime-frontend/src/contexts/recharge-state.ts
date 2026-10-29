import { computed, signal } from "@preact/signals";

export type PendingRecharge = {
  transactionId: string;
  cardNumber: number;
  adminCardNumber?: number;
  amount: number;
  paymentMethod: "card" | "cash";
};

export const rechargeAmountSignal = signal("");
export const rechargePaymentMethodSignal = signal<"card" | "cash">("card");
export const rechargeInProgressSignal = signal(false);
export const waitingForAdminSignal = signal(false);
// Carte administrateur déjà identifiée, en attente du mot de passe de
// configuration pour ouvrir la session signée.
export const adminPasswordCardSignal = signal<number | null>(null);
export const rechargeErrorSignal = signal<string | null>(null);
export const pendingRechargeSignal = signal<PendingRecharge | null>(null);

export const rechargeInteractionLockedSignal = computed(
  () =>
    rechargeInProgressSignal.value ||
    waitingForAdminSignal.value ||
    adminPasswordCardSignal.value !== null ||
    pendingRechargeSignal.value !== null,
);

export function resetRechargeState() {
  if (rechargeInProgressSignal.value) return;
  rechargeAmountSignal.value = "";
  rechargePaymentMethodSignal.value = "card";
  waitingForAdminSignal.value = false;
  adminPasswordCardSignal.value = null;
  rechargeErrorSignal.value = null;
  pendingRechargeSignal.value = null;
}
