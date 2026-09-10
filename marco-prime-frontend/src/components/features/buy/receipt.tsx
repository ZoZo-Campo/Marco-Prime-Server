import { shopping } from "../../../contexts/shopping-context";
import { MemberCard } from "./member-card";
import { PurchaseError, ResetButton, SubmitButton } from "./receipt-actions";
import { ReceiptItem } from "./receipt-item";

export function Receipt() {
  return (
    <aside class="border-l bg-card px-5 py-5 flex min-h-0 flex-col gap-4">
      <div class="flex items-center">
        <h2 class="text-xl font-semibold flex-1">Commande</h2>
        <ResetButton />
      </div>
      <MemberCard />
      <ul class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {shopping.selected.value.map((product) => (
          <ReceiptItem key={product.id} product={product} />
        ))}
        {shopping.selected.value.length === 0 && (
          <li class="rounded-lg border border-dashed p-5 text-center text-muted-foreground">
            Le panier est vide
          </li>
        )}
      </ul>
      <div class="flex items-center justify-between border-t pt-4">
        <span class="text-lg font-semibold">Total</span>
        <strong class="text-3xl text-primary">
          {shopping.total.value.toFixed(2)}€
        </strong>
      </div>
      <PurchaseError />
      <SubmitButton />
    </aside>
  );
}
