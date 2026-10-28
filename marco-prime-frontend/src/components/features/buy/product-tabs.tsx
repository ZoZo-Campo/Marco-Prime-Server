import z from "zod";
import { AlertCircle, RefreshCw } from "lucide-preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { apiUrl } from "../../../config/api";
import { capitalize } from "../../../utils/string";
import { haptic, ripple } from "../../../utils/feedback";
import { useApi } from "../../../hooks/use-api";
import { useSafeSearchParams } from "../../../hooks/use-safe-search-params";
import { BUY_ROUTE_URL } from "../../../pages/buy";
import { buySearchParamsSchema } from "../../../schemas/pagination.schema";
import { productTypeSchema } from "../../../schemas/product.schema";
import { Button } from "../../ui/button";
import { TabSkeleton } from "../../shared/loading/tab-skeleton";

interface Indicator {
  left: number;
  width: number;
}

export function ProductTabs() {
  const { data, loading, error, refetch } = useApi(
    z.array(productTypeSchema),
    apiUrl("product-types"),
  );
  const { searchParams, route } = useSafeSearchParams(buySearchParamsSchema);

  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [indicator, setIndicator] = useState<Indicator | null>(null);

  useEffect(() => {
    if (!data?.length) return;
    const categoryExists = data.some(
      (category) => category.id === searchParams.categoryId,
    );
    if (!categoryExists) {
      route(`${BUY_ROUTE_URL}?categoryId=${data[0]!.id}&page=1`);
    }
  }, [data, searchParams.categoryId]);

  // Indicateur qui glisse vers l'onglet actif
  useLayoutEffect(() => {
    if (!data?.length) return;
    const index = data.findIndex(
      (category) => category.id === searchParams.categoryId,
    );
    const element = itemRefs.current[index];
    if (element) {
      setIndicator({ left: element.offsetLeft, width: element.offsetWidth });
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
      <header class="flex items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-card px-4 py-3">
        <div class="flex items-center gap-2 text-destructive">
          <AlertCircle class="size-5" />
          <span class="text-sm font-medium">Catégories indisponibles</span>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw class="size-4" /> Réessayer
        </Button>
      </header>
    );
  }

  return (
    <header class="relative shrink-0" aria-label="Catégories de produits">
      <div class="no-scrollbar overflow-x-auto px-1 pb-1">
        <div class="relative flex min-w-max items-center gap-1.5 py-1">
          {indicator && (
            <span
              class="absolute inset-y-1.5 rounded-xl bg-primary/15 shadow-[inset_0_0_0_1px_var(--color-glow)] transition-all duration-300 ease-out"
              style={{ left: indicator.left, width: indicator.width }}
              aria-hidden="true"
            />
          )}
          {data.map((productType, index) => (
            <Tab
              key={productType.id}
              label={productType.type}
              category={productType.id}
              active={productType.id === searchParams.categoryId}
              ref={(element) => {
                itemRefs.current[index] = element as HTMLElement | null;
              }}
            />
          ))}
        </div>
      </div>
      <div
        class="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent"
        aria-hidden="true"
      />
      <div
        class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
        aria-hidden="true"
      />
    </header>
  );
}

interface TabProps {
  label: string;
  category: number;
  active: boolean;
  ref?: (element: HTMLElement | null) => void;
}

function Tab({ label, category, active, ref }: TabProps) {
  const { route } = useSafeSearchParams(buySearchParamsSchema);

  return (
    <button
      type="button"
      ref={ref}
      onClick={(event) => {
        ripple(event, "currentColor");
        haptic(12);
        route(`${BUY_ROUTE_URL}?categoryId=${category}&page=1`);
      }}
      class={
        "relative z-10 min-h-12 shrink-0 rounded-xl px-4 text-lg font-bold transition-colors duration-200 sm:min-h-14 sm:px-7 sm:text-xl " +
        (active
          ? "text-primary"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")
      }
    >
      {capitalize(label)}
    </button>
  );
}
