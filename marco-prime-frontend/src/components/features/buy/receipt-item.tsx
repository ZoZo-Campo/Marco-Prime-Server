import type { ProductInCart } from "../../../contexts/shopping-context";
import { Minus, Plus, Trash2 } from "lucide-preact";
import { shopping } from "../../../contexts/shopping-context";
import { purchaseInteractionLockedSignal } from "../../../contexts/purchase-state";
import { Button } from "../../ui/button";

interface ReceiptItemProps {
  product: ProductInCart;
}

export function ReceiptItem({ product }: ReceiptItemProps) {
  const disabled = purchaseInteractionLockedSignal.value;
  const lineTotal = Number(product.price) * product.amount;

  return (
    <li class="w-full rounded-lg border bg-background p-3 shadow-xs">
      <div class="flex items-center gap-3">
        <span class="min-w-0 flex-1 truncate font-semibold">
          {product.name}
        </span>
        <strong>{lineTotal.toFixed(2)}€</strong>
      </div>
      <div class="mt-2 flex items-center justify-between gap-2">
        <span class="text-sm text-muted-foreground">
          {product.price}€ l’unité
        </span>
        <div class="flex items-center gap-1">
          <Button
            size="icon-lg"
            variant="outline"
            onClick={() => shopping.decrement(product.id)}
            disabled={disabled}
            aria-label={`Retirer un ${product.name}`}
          >
            <Minus class="size-4" />
          </Button>
          <span class="min-w-8 text-center text-lg font-bold">
            {product.amount}
          </span>
          <Button
            size="icon-lg"
            variant="outline"
            onClick={() => shopping.increment(product.id)}
            disabled={disabled}
            aria-label={`Ajouter un ${product.name}`}
          >
            <Plus class="size-4" />
          </Button>
          <Button
            class="ml-1"
            size="icon-lg"
            variant="destructive"
            onClick={() => shopping.remove(product.id)}
            disabled={disabled}
            aria-label={`Supprimer ${product.name} du panier`}
          >
            <Trash2 class="size-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}
