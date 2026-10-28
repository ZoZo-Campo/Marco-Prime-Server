import { useRef } from "preact/hooks";
import type { ProductSchema } from "../../../schemas/product.schema";
import { useMember } from "../../../contexts/member-context";
import { productColors } from "../../../utils/colors";
import { formatEuro } from "../../../utils/format";
import { haptic, ripple } from "../../../utils/feedback";
import { playItemFeedback } from "../../../utils/scan-sound";
import { purchaseInteractionLockedSignal } from "../../../contexts/purchase-state";

interface ProductItemProps {
  product: ProductSchema;
  amount: number;
  onClick: () => void;
}

export function ProductItem({ product, amount, onClick }: ProductItemProps) {
  const { data } = useMember();
  const color = productColors(product.color, product.productTypeId);
  const selected = amount > 0;
  const flashRef = useRef<HTMLButtonElement>(null);

  const handleClick = (event: MouseEvent) => {
    if (!data || purchaseInteractionLockedSignal.value) return;
    onClick();
    playItemFeedback();
    haptic(12);
    ripple(event, color.swatch);

    const button = flashRef.current;
    if (button) {
      button.classList.remove("itemflash-anim");
      void button.offsetWidth;
      button.classList.add("itemflash-anim");
    }
  };

  return (
    <button
      ref={flashRef}
      style={{
        borderColor: color.border,
        backgroundColor: color.surface,
      }}
      class="relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-4 px-2.5 pb-3 pt-8 text-card-foreground shadow-md select-none transition-[transform,filter,box-shadow] duration-150 active:scale-[0.97] active:brightness-110 disabled:cursor-default disabled:opacity-40 disabled:active:scale-100 cursor-pointer sm:gap-2.5 sm:rounded-3xl sm:border-[6px] sm:px-4 sm:pb-4 sm:pt-10 lg:gap-3 lg:px-5 lg:pt-12"
      onClick={handleClick}
      disabled={!data || purchaseInteractionLockedSignal.value}
      aria-label={`${product.name}, ${formatEuro(product.price)}${selected ? `, quantité ${amount}` : ""}`}
    >
      {/* Halo coloré en haut de tuile */}
      <span
        class="pointer-events-none absolute -inset-x-10 -top-20 h-32 rounded-full blur-2xl"
        style={{ backgroundColor: color.swatch, opacity: 0.2 }}
        aria-hidden="true"
      />

      <span
        class="absolute left-2.5 top-2.5 size-4 rounded-full border-2 border-white/80 shadow-sm sm:left-3 sm:top-3 sm:size-5"
        style={{ backgroundColor: color.swatch }}
        aria-hidden="true"
      />

      {selected && (
        <span class="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground shadow-md sm:right-3 sm:top-3 sm:size-8 sm:text-base lg:size-10 lg:text-lg">
          ×{amount}
        </span>
      )}

      <span class="relative line-clamp-2 px-0.5 text-center text-base font-extrabold leading-tight sm:text-xl lg:text-2xl">
        {product.name}
      </span>
      <span class="relative rounded-full bg-background/60 px-3 py-1 text-xl font-bold shadow-sm sm:px-4 sm:py-1.5 sm:text-2xl lg:px-5 lg:py-2 lg:text-3xl">
        {formatEuro(product.price)}
      </span>
    </button>
  );
}
