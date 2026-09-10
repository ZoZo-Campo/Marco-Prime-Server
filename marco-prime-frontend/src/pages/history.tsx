import { HistoryList } from "../components/features/history/history-list";
import { HistoryNavigation } from "../components/features/history/history-navigation";
import { HISTORY_BATCH_SIZE } from "../constants";
import { useApi } from "../hooks/use-api";
import {
  orderListResponseSchema,
  type OrderSchema,
} from "../schemas/order.schema";
import { apiUrl } from "../config/api";
import { AlertCircle, RefreshCw } from "lucide-preact";
import { Button } from "../components/ui/button";
import { useEffect, useState } from "preact/hooks";
import type { PaginationSchema } from "../schemas/product.schema";

export const HISTORY_ROUTE_URL = "/history";

export function HistoryPage() {
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<OrderSchema[]>([]);
  const [pagination, setPagination] = useState<PaginationSchema | null>(null);

  const { data, loading, error, refetch } = useApi(
    orderListResponseSchema,
    apiUrl(`history?page=${page}&limit=${HISTORY_BATCH_SIZE}`),
  );

  useEffect(() => {
    if (!data) return;

    setOrders((current) => {
      if (page === 1) return data.data;

      const knownIds = new Set(current.map((order) => order.id));
      return [
        ...current,
        ...data.data.filter((order) => !knownIds.has(order.id)),
      ];
    });
    setPagination(data.pagination);
  }, [data, page]);

  if (error && orders.length === 0) {
    return (
      <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <AlertCircle class="size-10 text-destructive" />
        <div>
          <p class="font-semibold">Historique indisponible</p>
          <p class="text-sm text-muted-foreground">
            Vérifiez la connexion au serveur Marco Prime.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refetch()}>
          <RefreshCw class="size-4" /> Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div class="flex flex-col flex-1 min-h-0 gap-2 p-3">
      <HistoryNavigation
        total={pagination?.total ?? null}
        displayedCount={orders.length}
        loading={loading && orders.length === 0}
      />
      <HistoryList
        orders={pagination ? orders : null}
        loading={loading && orders.length === 0}
        loadingMore={loading && orders.length > 0}
        hasMore={pagination ? orders.length < pagination.total : false}
        loadMoreError={orders.length > 0 ? error : null}
        onLoadMore={() => setPage((current) => current + 1)}
        onRetry={() => void refetch()}
      />
    </div>
  );
}
