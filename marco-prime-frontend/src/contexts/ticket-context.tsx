import { signal } from "@preact/signals";
import type { PurchaseResponse } from "../schemas/purchase.schema";
import type { RechargeResponse } from "../schemas/recharge.schema";

export type PurchaseTicketData = {
  type: "purchase";
  transaction: PurchaseResponse["transaction"];
};

export type RechargeTicketData = {
  type: "recharge";
  transaction: RechargeResponse["transaction"];
};

export type TicketData = PurchaseTicketData | RechargeTicketData;

export const ticketSignal = signal<TicketData | null>(null);

export function setTicket(data: TicketData) {
  ticketSignal.value = data;
}

export function clearTicket() {
  ticketSignal.value = null;
}
