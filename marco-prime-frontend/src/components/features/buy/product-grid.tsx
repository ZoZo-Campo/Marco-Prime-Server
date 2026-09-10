import { useMemo } from "preact/hooks";
import { AlertCircle, RefreshCw } from "lucide-preact";
import { apiUrl } from "../../../config/api";
import {
  PRODUCT_FETCH_LIMIT,
  PRODUCT_GRID_PLACEHOLDER_COUNT,
} from "../../../constants";
import { shopping } from "../../../contexts/shopping-context";
import { useApi } from "../../../hooks/use-api";
import { useSafeSearchParams } from "../../../hooks/use-safe-search-params";
import { buySearchParamsSchema } from "../../../schemas/pagination.schema";
import { productListResponseSchema } from "../../../schemas/product.schema";
import { ProductSkeleton } from "../../shared/loading/product-skeleton";
import { ProductItem } from "./product-item";
import { Button } from "../../ui/button";

export function ProductGrid() {
  const { searchParams } = useSafeSearchParams(buySearchParamsSchema);
  const { data, loading, error, refetch } = useApi(
    productListResponseSchema,
    apiUrl(
      `products/${searchParams.categoryId}?page=1&limit=${PRODUCT_FETCH_LIMIT}`,
    ),
  );

  // O(1) lookup map for product amounts
  const amountMap = useMemo(() => {
    const map = new Map<number, number>();
    shopping.selected.value.forEach((product) => {
      map.set(product.id, product.amount);
    });
    return map;
  }, [shopping.selected.value]);

  if (loading) {
    return (
      <main class="flex-1 grid grid-cols-3 grid-rows-3 gap-2">
        {new Array(PRODUCT_GRID_PLACEHOLDER_COUNT).fill(null).map((_, id) => (
          <ProductSkeleton key={id} />
        ))}
      </main>
    );
  }

  if (error) {
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
    <main class="flex-1 grid grid-cols-3 auto-rows-[minmax(140px,1fr)] gap-2 overflow-y-auto pr-1">
      {data.data.map((product) => (
        <ProductItem
          key={product.id}
          product={product}
          amount={amountMap.get(product.id) ?? 0}
          onClick={() => shopping.append(product)}
        />
      ))}
    </main>
  );
}
