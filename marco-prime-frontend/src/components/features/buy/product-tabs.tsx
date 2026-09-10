import z from "zod";
import { AlertCircle, RefreshCw } from "lucide-preact";
import { useEffect } from "preact/hooks";
import { apiUrl } from "../../../config/api";
import { cn } from "../../../utils/cn";
import { capitalize } from "../../../utils/string";
import { useApi } from "../../../hooks/use-api";
import { useSafeSearchParams } from "../../../hooks/use-safe-search-params";
import { BUY_ROUTE_URL } from "../../../pages/buy";
import { buySearchParamsSchema } from "../../../schemas/pagination.schema";
import { productTypeSchema } from "../../../schemas/product.schema";
import { Button } from "../../ui/button";
import { TabSkeleton } from "../../shared/loading/tab-skeleton";

export function ProductTabs() {
  const { data, loading, error, refetch } = useApi(
    z.array(productTypeSchema),
    apiUrl("product-types"),
  );
  const { searchParams, route } = useSafeSearchParams(buySearchParamsSchema);

  useEffect(() => {
    if (!data?.length) return;
    const categoryExists = data.some(
      (category) => category.id === searchParams.categoryId,
    );
    if (!categoryExists) {
      route(`${BUY_ROUTE_URL}?categoryId=${data[0]!.id}&page=1`);
    }
  }, [data, searchParams.categoryId]);

  if (loading) {
    return (
      <header class="flex min-h-16 items-center gap-3 overflow-hidden">
        <div class="flex min-w-0 flex-1 gap-3 overflow-hidden">
          {new Array(4).fill(null).map((_, id) => (
            <TabSkeleton key={id} />
          ))}
        </div>
      </header>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <header class="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-card px-4 py-2">
        <div class="flex items-center gap-2 text-destructive">
          <AlertCircle class="size-4" />
          <span class="text-sm font-medium">Catégories indisponibles</span>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw class="size-4" /> Réessayer
        </Button>
      </header>
    );
  }

  return (
    <header class="relative min-h-16" aria-label="Catégories de produits">
      <div class="flex min-h-16 items-center gap-3 overflow-x-auto px-4 pb-1">
        <div class="flex min-w-max gap-3">
          {data.map((productType) => (
            <Tab
              key={productType.id}
              label={productType.type}
              category={productType.id}
            />
          ))}
        </div>
      </div>
      <div
        class="pointer-events-none absolute inset-y-1 left-0 w-7 bg-gradient-to-r from-background to-transparent"
        aria-hidden="true"
      />
      <div
        class="pointer-events-none absolute inset-y-1 right-0 w-7 bg-gradient-to-l from-background to-transparent"
        aria-hidden="true"
      />
    </header>
  );
}

function Tab({ label, category }: { label: string; category: number }) {
  const { searchParams, route } = useSafeSearchParams(buySearchParamsSchema);
  const isActive = category === searchParams.categoryId;

  return (
    <Button
      class={cn(
        "min-h-14 rounded-lg border px-7 text-xl shadow-sm",
        isActive &&
          "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
      )}
      variant={isActive ? "default" : "outline"}
      onClick={() =>
        route(`${BUY_ROUTE_URL}?categoryId=${category}&page=1`)
      }
    >
      {capitalize(label)}
    </Button>
  );
}
