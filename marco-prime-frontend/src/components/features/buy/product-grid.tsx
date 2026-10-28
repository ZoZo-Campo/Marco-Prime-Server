import { useEffect, useMemo, useRef } from "preact/hooks";
import { AlertCircle, RefreshCw } from "lucide-preact";
import { apiUrl } from "../../../config/api";
import {
  PRODUCT_FETCH_LIMIT,
  PRODUCT_GRID_PLACEHOLDER_COUNT,
  PRODUCT_PRICE_REFRESH_INTERVAL_MS,
} from "../../../constants";
import { shopping } from "../../../contexts/shopping-context";
import { useMember } from "../../../contexts/member-context";
import { useApi } from "../../../hooks/use-api";
import { useSafeSearchParams } from "../../../hooks/use-safe-search-params";
import { buySearchParamsSchema } from "../../../schemas/pagination.schema";
import { productListResponseSchema } from "../../../schemas/product.schema";
import { ProductSkeleton } from "../../shared/loading/product-skeleton";
import { ProductItem } from "./product-item";
import { Button } from "../../ui/button";

export function ProductGrid() {
  const { data: member } = useMember();
  const { searchParams } = useSafeSearchParams(buySearchParamsSchema);
  const { data, loading, error, refetch } = useApi(
    productListResponseSchema,
    apiUrl(
      `products/${searchParams.categoryId}?page=1&limit=${PRODUCT_FETCH_LIMIT}`,
    ),
  );

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refetchRef.current();
    }, PRODUCT_PRICE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (data) shopping.refreshProductDetails(data.data);
  }, [data]);

  // O(1) lookup map for product amounts
  const amountMap = useMemo(() => {
    const map = new Map<number, number>();
    shopping.selected.value.forEach((product) => {
      map.set(product.id, product.amount);
    });
    return map;
  }, [shopping.selected.value]);

  if (loading && !data) {
    return (
      <main class="grid flex-1 grid-cols-2 auto-rows-[9rem] gap-3 sm:auto-rows-[12rem] sm:gap-4 md:grid-cols-3 lg:auto-rows-[14rem] lg:gap-6">
        {new Array(PRODUCT_GRID_PLACEHOLDER_COUNT).fill(null).map((_, id) => (
          <ProductSkeleton key={id} />
        ))}
      </main>
    );
  }

  if (error && !data) {
    return (
      <main class="flex-1 flex flex-col items-center justify-center gap-4 text-center">
        <AlertCircle class="size-10 text-destructive" />
        <div>
          <p class="font-semibold">Catalogue indisponible</p>
          <p class="text-sm text-muted-foreground">
            Vérifiez la connexion au serveur Marco Prime.
          </p>
        </div>
        <Button variant="outline" onClick={refetch}>
          <RefreshCw class="size-4" /> Réessayer
        </Button>
      </main>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <main class="flex-1 flex items-center justify-center text-muted-foreground">
        Aucun produit disponible dans cette catégorie.
      </main>
    );
  }

  return (
    <>
      {!member && (
        <button
          type="button"
          class="shrink-0 rounded-xl border border-dashed bg-card/60 px-4 py-3 text-left text-sm text-muted-foreground lg:hidden"
          onClick={() =>
            document
              .getElementById("commande")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          Scannez une carte pour activer les produits —{" "}
          <span class="font-semibold text-primary">ouvrir la commande</span>
        </button>
      )}
      <main class="no-scrollbar grid flex-1 grid-cols-2 auto-rows-[9rem] content-start gap-3 pr-1 sm:auto-rows-[12rem] sm:gap-4 md:grid-cols-3 lg:auto-rows-[14rem] lg:gap-6 lg:overflow-y-auto">
        {data.data.map((product) => (
          <ProductItem
            key={product.id}
            product={product}
            amount={amountMap.get(product.id) ?? 0}
            onClick={() => shopping.append(product)}
          />
        ))}
      </main>
    </>
  );
}
