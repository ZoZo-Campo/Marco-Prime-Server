import { ProductTabs } from "../components/features/buy/product-tabs";
import { ProductGrid } from "../components/features/buy/product-grid";
import { Receipt } from "../components/features/buy/receipt";
import { MemberProvider } from "../contexts/member-context";
import { purchaseInteractionLockedSignal } from "../contexts/purchase-state";

export const BUY_ROUTE_URL = "/buy";

export function BuyPage() {
  return (
    <MemberProvider disabled={purchaseInteractionLockedSignal.value}>
      <div class="flex flex-1 min-h-0 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(340px,24%,420px)] lg:overflow-hidden">
        <div class="flex flex-col gap-4 px-4 py-4 lg:min-h-0 lg:overflow-hidden lg:px-6 lg:py-5">
          <ProductTabs />
          <ProductGrid />
        </div>
        <Receipt />
      </div>
    </MemberProvider>
  );
}
