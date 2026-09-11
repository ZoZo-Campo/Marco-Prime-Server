import type { OrderSchema } from "../../../schemas/order.schema";

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
  const isRecharge = order.product === null && !isRefund;
  const productName = isRefund
    ? `Remboursement correction #${order.correctionOriginalOrderId}`
    : order.product?.name ?? "Rechargement";
  const ledgerAmount = Number(order.price);
  const formattedAmount = Number.isFinite(ledgerAmount)
    ? `${ledgerAmount > 0 ? "+" : ""}${ledgerAmount.toFixed(2)} EUR`
    : "Montant invalide";
  const hasInvalidSign = isRecharge ? ledgerAmount <= 0 : ledgerAmount >= 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      class="grid min-w-[60rem] w-full grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1.4fr)_7rem_7rem_7rem_7rem] items-center gap-4 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      <span class="truncate font-medium">{memberName}</span>
      <span class="truncate text-muted-foreground">
        {isRecharge || isRefund ? productName : `${order.amount}x ${productName}`}
        {isCorrectedOriginal && " · corrigée"}
        {isReplacement && " · remplacement"}
      </span>
      <span
        class={`text-right font-medium ${
          hasInvalidSign
            ? "text-amber-600"
            : isRecharge || isRefund
              ? "text-green-600"
              : "text-destructive"
        }`}
        title={hasInvalidSign ? "Signe comptable incohérent" : undefined}
      >
        {formattedAmount}
      </span>
      <span class="text-right tabular-nums text-muted-foreground">
        {previousBalance ?? "—"}
      </span>
      <span class="text-right tabular-nums font-medium">
        {newBalance ?? "—"}
      </span>
      <span class="text-right text-muted-foreground">{formattedDate}</span>
    </button>
  );
}
