import type { OrderSchema } from "../../../schemas/order.schema";
import { formatEuro } from "../../../utils/format";

interface HistoryItemProps {
  order: OrderSchema;
  previousBalance: string | null;
  newBalance: string | null;
  onSelect: () => void;
}

export function HistoryItem({
  order,
  previousBalance,
  newBalance,
  onSelect,
}: HistoryItemProps) {
  const formattedDate = new Date(order.date).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const memberName = order.member
    ? `${order.member.firstName} ${order.member.lastName}`
    : "Membre supprimé";
  const isRefund = order.ledgerKind === "correction-refund";
  const isCorrectedOriginal = order.ledgerKind === "corrected-original";
  const isReplacement = order.ledgerKind === "correction-replacement";
  const isRechargeCorrection = order.ledgerKind === "recharge-correction";
  const isRechargeCorrected = order.ledgerKind === "recharge-corrected";
  const isRecharge =
    order.product === null &&
    !isRefund &&
    !isRechargeCorrection &&
    !isRechargeCorrected;
  const rechargeMethod =
    order.paymentMethod === "card"
      ? " · CB"
      : order.paymentMethod === "cash"
        ? " · Espèces"
        : "";
  const productName = isRefund
    ? `Remboursement correction #${order.correctionOriginalOrderId}`
    : order.product?.name ?? "Rechargement";
  const operation = isRechargeCorrection
    ? `Annulation rechargement #${order.correctionOriginalOrderId}`
    : isRechargeCorrected
      ? `Rechargement annulé${rechargeMethod}`
      : isRecharge || isRefund
        ? `${productName}${isRecharge ? rechargeMethod : ""}`
        : `${order.amount}x ${productName}`;
  const ledgerAmount = Number(order.effectivePrice);
  const formattedAmount = Number.isFinite(ledgerAmount)
    ? `${ledgerAmount > 0 ? "+" : ""}${formatEuro(ledgerAmount)}`
    : "Montant invalide";
  const hasInvalidSign = isRechargeCorrection
    ? ledgerAmount >= 0
    : isRecharge || isRechargeCorrected
      ? ledgerAmount <= 0
      : ledgerAmount >= 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      class="flex w-full flex-col gap-1.5 border-b px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none lg:grid lg:min-w-[60rem] lg:grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1.4fr)_7rem_7rem_7rem_7rem] lg:items-center lg:gap-4 lg:px-3 lg:py-2"
    >
      <span class="flex items-baseline justify-between gap-3 lg:contents">
        <span class="truncate font-medium lg:order-1">{memberName}</span>
        <span
          class={`shrink-0 font-semibold tabular-nums lg:order-3 lg:text-right lg:font-medium ${
            hasInvalidSign
              ? "text-amber-600"
              : isRechargeCorrection
                ? "text-destructive"
                : isRechargeCorrected
                  ? "text-muted-foreground line-through"
                  : isRecharge || isRefund
                    ? "text-green-600"
                    : "text-destructive"
          }`}
          title={hasInvalidSign ? "Signe comptable incohérent" : undefined}
        >
          {formattedAmount}
        </span>
      </span>
      <span class="truncate text-muted-foreground lg:order-2">
        {operation}
        {isCorrectedOriginal && " · corrigée"}
        {isReplacement && " · remplacement"}
      </span>
      <span class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground lg:contents">
        <span class="lg:order-6 lg:text-sm lg:text-right lg:text-muted-foreground">
          {formattedDate}
        </span>
        <span class="tabular-nums lg:order-4 lg:text-sm lg:text-right">
          {formatBalance(previousBalance)}
        </span>
        <span class="lg:hidden" aria-hidden="true">
          →
        </span>
        <span class="tabular-nums font-medium text-foreground lg:order-5 lg:text-sm lg:text-right">
          {formatBalance(newBalance)}
        </span>
      </span>
    </button>
  );
}

function formatBalance(value: string | null) {
  if (value === null) return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? formatEuro(amount) : "—";
}
