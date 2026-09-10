import { useLocation } from "preact-iso";
import { BUY_ROUTE_URL } from "./buy";
import { shopping } from "../contexts/shopping-context";
import { resetPurchaseState } from "../contexts/purchase-state";
import { resetRechargeState } from "../contexts/recharge-state";

export const HOME_ROUTE_URL = "/";

export function HomePage() {
  const { route } = useLocation();
  return (
    <div
      class="flex-1 flex flex-col justify-center items-center cursor-pointer gap-5"
      onClick={() => {
        shopping.reset();
        resetPurchaseState();
        resetRechargeState();
        route(BUY_ROUTE_URL);
      }}
    >
      <img src="/marco.svg" alt="Marco Logo" class="h-40" />
      <div class="flex items-end gap-2">
        <h1 class="text-2xl h-12">Powered by</h1>
        <img src="/asse.png" alt="ASSE" class="h-20" />
      </div>
    </div>
  );
}
