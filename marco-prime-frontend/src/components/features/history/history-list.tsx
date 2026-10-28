import { AlertCircle, RefreshCw, X } from "lucide-preact";
import { useState } from "preact/hooks";
import { HISTORY_SKELETON_COUNT } from "../../../constants";
import type { OrderSchema } from "../../../schemas/order.schema";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Skeleton } from "../../ui/skeleton";
import { HistoryItem } from "./history-item";
import { OrderCorrectionForm } from "./order-correction-form";
import { RechargeCorrectionForm } from "./recharge-correction-form";

function HistoryListSkeleton() {
  return (
    <Card class="min-h-0 flex-1 gap-0 py-0 overflow-auto">
      <div class="hidden min-w-[60rem] grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1.4fr)_7rem_7rem_7rem_7rem] items-center gap-4 border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
        <span>Membre</span>
        <span>Opération</span>
        <span class="text-right">Montant</span>
        <span class="text-right">Ancien solde</span>
        <span class="text-right">Nouveau solde</span>
        <span class="text-right">Date</span>
      </div>
      {new Array(HISTORY_SKELETON_COUNT).fill(null).map((_, index) => (
        <div
          key={index}
          class="grid w-full grid-cols-2 items-center gap-3 border-b px-4 py-3 last:border-b-0 lg:min-w-[60rem] lg:grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1.4fr)_7rem_7rem_7rem_7rem] lg:gap-4 lg:px-3"
        >
          <Skeleton class="h-3 w-32" />
          <Skeleton class="h-3 w-24" />
          <Skeleton class="ml-auto hidden h-3 w-20 lg:block" />
          <Skeleton class="ml-auto hidden h-3 w-20 lg:block" />
          <Skeleton class="ml-auto hidden h-3 w-20 lg:block" />
          <Skeleton class="ml-auto hidden h-3 w-20 lg:block" />
        </div>
      ))}
    </Card>
  );
}

interface HistoryListProps {
  orders: OrderSchema[] | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMoreError: Error | null;
  onLoadMore: () => void;
  onRetry: () => void;
  onCorrectionComplete: () => void;
}

export function HistoryList({
  orders,
  loading,
  loadingMore,
  hasMore,
  loadMoreError,
  onLoadMore,
  onRetry,
  onCorrectionComplete,
}: HistoryListProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  if (loading || !orders) {
    return <HistoryListSkeleton />;
  }

  if (orders.length === 0) {
    return (
      <Card class="flex min-h-0 flex-1 items-center justify-center py-0 text-muted-foreground">
        Aucune commande dans l’historique.
      </Card>
    );
  }

  const selectedOrder = orders.find((order) => order.id === selectedOrderId);

  return (
    <Card class="min-h-0 flex-1 gap-0 py-0 overflow-auto">
      <div class="sticky top-0 z-10 hidden min-w-[60rem] grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1.4fr)_7rem_7rem_7rem_7rem] items-center gap-4 border-b bg-card px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
        <span>Membre</span>
        <span>Opération</span>
        <span class="text-right">Montant</span>
        <span class="text-right">Ancien solde</span>
        <span class="text-right">Nouveau solde</span>
        <span class="text-right">Date</span>
      </div>
      {orders.map((order) => (
        <HistoryItem
          key={order.id}
          order={order}
          previousBalance={order.previousBalance}
          newBalance={order.newBalance}
          onSelect={() => setSelectedOrderId(order.id)}
        />
      ))}
      {loadMoreError ? (
        <div class="flex min-h-16 items-center justify-center gap-3 p-2 text-destructive">
          <AlertCircle class="size-5" />
          <span>Impossible de charger les anciennes commandes.</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw class="size-4" /> Réessayer
          </Button>
        </div>
      ) : hasMore ? (
        <div class="flex justify-center p-3">
          <Button
            class="w-full text-base sm:min-h-14 sm:w-auto sm:min-w-72 sm:text-lg"
            variant="outline"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Chargement…" : "Afficher les commandes précédentes"}
          </Button>
        </div>
      ) : orders.length > 0 ? (
        <p class="p-4 text-center text-sm text-muted-foreground">
          Toutes les commandes sont affichées.
        </p>
      ) : null}
      {selectedOrder && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
          role="presentation"
          onClick={() => setSelectedOrderId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-title"
            class="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-xl border bg-card p-5 pb-2 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-6 sm:pb-2"
            onClick={(event) => event.stopPropagation()}
          >
            <div class="mb-6 flex items-center justify-between">
              <div>
                <h2 id="transaction-title" class="text-2xl font-bold">
                  Détail de la transaction
                </h2>
                <p class="text-sm text-muted-foreground">
                  Écriture Fouaille n°{selectedOrder.id}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Fermer"
                onClick={() => setSelectedOrderId(null)}
              >
                <X class="size-6" />
              </Button>
            </div>
            <TransactionDetail
              order={selectedOrder}
              previousBalance={selectedOrder.previousBalance}
              newBalance={selectedOrder.newBalance}
            />
            {canCorrect(selectedOrder) && (
              <OrderCorrectionForm
                order={selectedOrder}
                onComplete={() => {
                  setSelectedOrderId(null);
                  onCorrectionComplete();
                }}
              />
            )}
            {canCorrectRecharge(selectedOrder) && (
              <RechargeCorrectionForm
                order={selectedOrder}
                onComplete={() => {
                  setSelectedOrderId(null);
                  onCorrectionComplete();
                }}
              />
            )}
            {!canCorrect(selectedOrder) &&
              selectedOrder.ledgerKind === "corrected-original" && (
                <p class="mt-6 border-t pt-5 text-center text-muted-foreground">
                  Cette vente a déjà été corrigée.
                </p>
              )}
            {!canCorrectRecharge(selectedOrder) &&
              selectedOrder.ledgerKind === "recharge-corrected" && (
                <p class="mt-6 border-t pt-5 text-center text-muted-foreground">
                  Ce rechargement a déjà été annulé.
                </p>
              )}
          </div>
        </div>
      )}
    </Card>
  );
}

function canCorrect(order: OrderSchema) {
  return (
    order.product !== null &&
    Number(order.price) < 0 &&
    (order.ledgerKind === undefined || order.ledgerKind === "purchase")
  );
}

function canCorrectRecharge(order: OrderSchema) {
  return (
    order.product === null &&
    Number(order.effectivePrice) > 0 &&
    (order.ledgerKind === undefined || order.ledgerKind === "recharge")
  );
}

function paymentMethodLabel(method: "card" | "cash" | null | undefined) {
  if (method === "card") return "Carte bancaire";
  if (method === "cash") return "Espèces";
  return null;
}

function TransactionDetail({
  order,
  previousBalance,
  newBalance,
}: {
  order: OrderSchema;
  previousBalance: string | null;
  newBalance: string | null;
}) {
  const memberName = order.member
    ? `${order.member.firstName} ${order.member.lastName}`
    : "Membre supprimé";
  const operation =
    order.ledgerKind === "recharge-correction"
      ? `Annulation du rechargement #${order.correctionOriginalOrderId}`
      : order.ledgerKind === "recharge-corrected"
        ? "Rechargement annulé"
        : order.ledgerKind === "correction-refund"
          ? `Remboursement de la vente #${order.correctionOriginalOrderId}`
          : order.product
            ? `${order.amount} × ${order.product.name}${
                order.ledgerKind === "corrected-original"
                  ? " (vente corrigée)"
                  : order.ledgerKind === "correction-replacement"
                    ? " (remplacement)"
                    : ""
              }`
            : "Rechargement";
  const amount = Number(order.effectivePrice);
  const date = new Date(order.date).toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const rows = [
    ["Membre", memberName],
    ["Opération", operation],
    ["Montant", Number.isFinite(amount) ? `${amount.toFixed(2)} €` : "—"],
    ...(order.product === null && paymentMethodLabel(order.paymentMethod)
      ? [["Mode de paiement", paymentMethodLabel(order.paymentMethod)]]
      : []),
    ["Ancien solde", formatBalance(previousBalance)],
    ["Nouveau solde", formatBalance(newBalance)],
    ["Date", date],
    ...(order.correctionReason
      ? [["Raison de la correction", order.correctionReason]]
      : []),
  ];

  return (
    <dl class="grid grid-cols-[auto_1fr] gap-x-8 gap-y-4 text-lg">
      {rows.map(([label, value]) => (
        <>
          <dt class="text-muted-foreground">{label}</dt>
          <dd class="text-right font-medium">{value}</dd>
        </>
      ))}
    </dl>
  );
}

function formatBalance(value: string | null) {
  if (value === null) return "Indisponible";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(2)} €` : "Indisponible";
}
