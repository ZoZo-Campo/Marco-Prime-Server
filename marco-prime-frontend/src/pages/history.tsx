import { HistoryList } from "../components/features/history/history-list";
import { HistoryNavigation } from "../components/features/history/history-navigation";
import { HISTORY_BATCH_SIZE } from "../constants";
import { useApi } from "../hooks/use-api";
import {
  orderListResponseSchema,
  type OrderSchema,
} from "../schemas/order.schema";
import { apiUrl } from "../config/api";
import {
  AlertCircle,
  CalendarDays,
  RefreshCw,
  Search,
  X,
} from "lucide-preact";
import { Button } from "../components/ui/button";
import { useEffect, useMemo, useState } from "preact/hooks";
import type { PaginationSchema } from "../schemas/product.schema";

export const HISTORY_ROUTE_URL = "/history";

export function HistoryPage() {
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<OrderSchema[]>([]);
  const [pagination, setPagination] = useState<PaginationSchema | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");
  const [filters, setFilters] = useState({ search: "", from: "", to: "" });

  const historyUrl = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(HISTORY_BATCH_SIZE),
    });
    if (filters.search) params.set("search", filters.search);
    if (filters.from) {
      params.set("from", localDateBoundary(filters.from).toISOString());
    }
    if (filters.to) {
      params.set("to", localDateBoundary(filters.to, true).toISOString());
    }
    return apiUrl(`history?${params.toString()}`);
  }, [page, filters.search, filters.from, filters.to]);

  const { data, loading, error, refetch } = useApi(
    orderListResponseSchema,
    historyUrl,
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

  const refreshAfterCorrection = () => {
    setOrders([]);
    setPagination(null);
    if (page === 1) void refetch();
    else setPage(1);
  };

  const applyFilters = () => {
    setOrders([]);
    setPagination(null);
    setPage(1);
    const next = {
      search: searchDraft.trim(),
      from: fromDraft,
      to: toDraft,
    };
    if (
      page === 1 &&
      next.search === filters.search &&
      next.from === filters.from &&
      next.to === filters.to
    ) {
      void refetch();
    } else {
      setFilters(next);
    }
  };

  const clearFilters = () => {
    setSearchDraft("");
    setFromDraft("");
    setToDraft("");
    setOrders([]);
    setPagination(null);
    setPage(1);
    setFilters({ search: "", from: "", to: "" });
  };

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
    <div class="flex w-full min-w-0 flex-1 flex-col gap-2 p-3 min-h-0">
      <HistoryNavigation
        total={pagination?.total ?? null}
        displayedCount={orders.length}
        loading={loading && orders.length === 0}
      />
      <div class="rounded-lg border bg-card p-3">
        <div class="flex flex-wrap items-end gap-3">
          <label class="w-full min-w-0 sm:w-auto sm:min-w-64 sm:flex-1">
            <span class="mb-1 block text-sm text-muted-foreground">
              Nom, produit ou n° de transaction
            </span>
            <span class="flex h-12 items-center gap-2 border bg-background px-3">
              <Search class="size-5 text-muted-foreground" />
              <input
                class="min-w-0 flex-1 bg-transparent text-lg outline-none"
                value={searchDraft}
                inputMode="text"
                autocomplete="off"
                onInput={(event) => setSearchDraft(event.currentTarget.value)}
              />
            </span>
          </label>
          <DateFilter
            label="Du"
            value={fromDraft}
            onInput={setFromDraft}
          />
          <DateFilter label="Au" value={toDraft} onInput={setToDraft} />
          <Button class="w-full sm:w-auto" onClick={applyFilters}>
            Rechercher
          </Button>
          {(filters.search || filters.from || filters.to) && (
            <Button
              class="w-full sm:w-auto"
              variant="ghost"
              onClick={clearFilters}
            >
              <X /> Effacer
            </Button>
          )}
        </div>
      </div>
      <HistoryList
        orders={pagination ? orders : null}
        loading={loading && orders.length === 0}
        loadingMore={loading && orders.length > 0}
        hasMore={pagination ? orders.length < pagination.total : false}
        loadMoreError={orders.length > 0 ? error : null}
        onLoadMore={() => setPage((current) => current + 1)}
        onRetry={() => void refetch()}
        onCorrectionComplete={refreshAfterCorrection}
      />
    </div>
  );
}

function DateFilter({
  label,
  value,
  onInput,
}: {
  label: string;
  value: string;
  onInput: (value: string) => void;
}) {
  return (
    <label class="min-w-[9.5rem] flex-1 sm:min-w-0 sm:flex-none">
      <span class="mb-1 block text-sm text-muted-foreground">{label}</span>
      <span class="flex h-12 min-w-0 items-center gap-2 border bg-background px-3">
        <CalendarDays class="size-5 shrink-0 text-muted-foreground" />
        <input
          type="date"
          class="w-full min-w-[6.5rem] bg-transparent text-base outline-none sm:min-w-0"
          value={value}
          onInput={(event) => onInput(event.currentTarget.value)}
        />
      </span>
    </label>
  );
}

function localDateBoundary(value: string, nextDay = false) {
  const date = new Date(`${value}T00:00:00`);
  if (nextDay) date.setDate(date.getDate() + 1);
  return date;
}
