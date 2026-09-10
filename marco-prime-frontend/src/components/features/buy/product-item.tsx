import type { ProductSchema } from "../../../schemas/product.schema";
import { useMember } from "../../../contexts/member-context";
import { cn } from "../../../utils/cn";
import { closestColor } from "../../../utils/colors";
import { purchaseInteractionLockedSignal } from "../../../contexts/purchase-state";

interface ProductItemProps {
  product: ProductSchema;
  amount: number;
  onClick: () => void;
}

export function ProductItem({ product, amount, onClick }: ProductItemProps) {
  const { data } = useMember();
  const color = closestColor(product.color);
  const selected = amount > 0;

  return (
    <button
      key={product.id}
      style={{
        borderColor: color,
        backgroundColor: selected ? `${color}30` : "var(--color-card)",
      }}
      class={cn(
        "relative border-2 justify-center items-center disabled:cursor-default cursor-pointer flex flex-col gap-3 px-3 pb-3 pt-10 hover:brightness-90 active:scale-[0.98] select-none text-card-foreground transition-all duration-150 disabled:opacity-50 disabled:border-border",
        selected && "ring-2 ring-primary ring-offset-2 shadow-md",
      )}
      onClick={onClick}
      disabled={!data || purchaseInteractionLockedSignal.value}
      aria-label={`${product.name}, ${product.price} euros${selected ? `, quantité ${amount}` : ""}`}
    >
      {selected && (
        <span class="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-md">
          ×{amount}
        </span>
      )}
      <span class="text-xl font-semibold text-center line-clamp-2">
        {product.name}
      </span>
      <span class={cn("text-lg", " text-muted-foreground")}>
        {product.price}€
      </span>
    </button>
  );
}
