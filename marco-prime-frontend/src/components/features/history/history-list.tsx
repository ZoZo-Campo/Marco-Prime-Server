import { AlertCircle, RefreshCw, X } from "lucide-preact";
import { useState } from "preact/hooks";
import { HISTORY_SKELETON_COUNT } from "../../../constants";
import type { OrderSchema } from "../../../schemas/order.schema";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Skeleton } from "../../ui/skeleton";
import { HistoryItem } from "./history-item";

function HistoryListSkeleton() {
  return (
    <Card class="min-h-0 gap-0 py-0 overflow-auto">
      <div class="grid min-w-[60rem] grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1.4fr)_7rem_7rem_7rem_7rem] items-center gap-4 border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
          class="grid min-w-[60rem] grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1.4fr)_7rem_7rem_7rem_7rem] items-center gap-4 border-b px-3 py-3 last:border-b-0"
        >
          <Skeleton class="h-3 w-32" />
          <Skeleton class="h-3 w-24" />
          <Skeleton class="ml-auto h-3 w-20" />
          <Skeleton class="ml-auto h-3 w-20" />
          <Skeleton class="ml-auto h-3 w-20" />
          <Skeleton class="ml-auto h-3 w-20" />
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
}

export function HistoryList({
  orders,
  loading,
  loadingMore,
  hasMore,
  loadMoreError,
  onLoadMore,
  onRetry,
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

  const balancesByOrder = calculateBalances(orders);
  const selectedOrder = orders.find((order) => order.id === selectedOrderId);
  const selectedBalances = selectedOrder
    ? balancesByOrder.get(selectedOrder.id)
    : undefined;

  return (
    <Card class="min-h-0 gap-0 py-0 overflow-auto">
      <div class="sticky top-0 z-10 grid min-w-[60rem] grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1.4fr)_7rem_7rem_7rem_7rem] items-center gap-4 border-b bg-card px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
          previousBalance={balancesByOrder.get(order.id)?.previousBalance ?? null}
          newBalance={balancesByOrder.get(order.id)?.newBalance ?? null}
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
            class="min-h-14 min-w-72 text-lg"
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
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          role="presentation"
          onClick={() => setSelectedOrderId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-title"
            class="w-full max-w-xl rounded-xl border bg-card p-6 shadow-2xl"
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
              previousBalance={selectedBalances?.previousBalance ?? null}
              newBalance={selectedBalances?.newBalance ?? null}
            />
          </div>
        </div>
      )}
    </Card>
  );
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
  const operation = order.ledgerKind === "correction-refund"
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
  const amount = Number(order.price);
  const date = new Date(order.date).toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const rows = [
    ["Membre", memberName],
    ["Opération", operation],
    ["Montant enregistré", Number.isFinite(amount) ? `${amount.toFixed(2)} €` : "—"],
    ["Ancien solde", previousBalance ?? "Indisponible"],
    ["Nouveau solde", newBalance ?? "Indisponible"],
    ["Date", date],
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

interface HistoricalBalance {
  previousBalance: string;
  newBalance: string;
}

function calculateBalances(orders: OrderSchema[]) {
  const runningBalances = new Map<number, number>();
  const balancesByOrder = new Map<number, HistoricalBalance>();

  for (const order of orders) {
    if (!order.member) continue;

    const memberId = order.member.id;
    const currentBalance = runningBalances.get(memberId)
      ?? toCents(order.member.balance);
    if (currentBalance === null) continue;

    const storedAmount = toCents(order.price);
    if (storedAmount === null) continue;

    const previousBalance = currentBalance - storedAmount;

    balancesByOrder.set(order.id, {
      previousBalance: fromCents(previousBalance),
      newBalance: fromCents(currentBalance),
    });
    runningBalances.set(memberId, previousBalance);
  }

  return balancesByOrder;
}

function toCents(value: string) {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function fromCents(value: number) {
  return `${(value / 100).toFixed(2)} €`;
}
