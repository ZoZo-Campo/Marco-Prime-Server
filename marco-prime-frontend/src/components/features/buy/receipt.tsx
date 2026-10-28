import { shopping } from "../../../contexts/shopping-context";
import { formatEuro } from "../../../utils/format";
import { MemberCard } from "./member-card";
import { PurchaseError, ResetButton, SubmitButton } from "./receipt-actions";
import { ReceiptItem } from "./receipt-item";

export function Receipt() {
  return (
    <aside id="commande" class="flex scroll-mt-4 flex-col gap-4 border-t bg-card/60 px-4 py-4 sm:px-5 lg:min-h-0 lg:border-l lg:border-t-0 lg:px-5 lg:py-5">
      <div class="flex items-center">
        <h2 class="flex-1 text-xl font-bold tracking-tight">Commande</h2>
        <ResetButton />
      </div>

      <MemberCard />

      <ul class="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 lg:max-h-none">
        {shopping.selected.value.map((product) => (
          <ReceiptItem key={product.id} product={product} />
        ))}
        {shopping.selected.value.length === 0 && (
          <li class="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Panier vide — scannez votre carte puis touchez vos produits
          </li>
        )}
      </ul>

      <div class="rounded-2xl bg-secondary/60 px-4 py-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-lg font-semibold text-muted-foreground">Total</span>
          <strong class="text-4xl font-extrabold tracking-tight text-primary">
            {formatEuro(shopping.total.value)}
          </strong>
        </div>
      </div>

      <PurchaseError />
      <SubmitButton />
    </aside>
  );
}
