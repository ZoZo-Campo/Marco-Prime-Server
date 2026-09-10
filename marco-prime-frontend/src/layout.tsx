import type { PropsWithChildren } from "preact/compat";
import { useLocation } from "preact-iso";
import { useEffect } from "preact/hooks";
import { NavBar } from "./components/layout/navbar";
import { shopping } from "./contexts/shopping-context";
import { clearTicket } from "./contexts/ticket-context";
import { HOME_ROUTE_URL } from "./pages/home";
import {
  purchaseInteractionLockedSignal,
  resetPurchaseState,
} from "./contexts/purchase-state";
import {
  rechargeInteractionLockedSignal,
  resetRechargeState,
} from "./contexts/recharge-state";

type LayoutProps = PropsWithChildren;

export function Layout({ children }: LayoutProps) {
  const { route } = useLocation();

  useEffect(() => {
    let timeout = window.setTimeout(resetSession, 120_000);

    function resetSession() {
      if (
        purchaseInteractionLockedSignal.value ||
        rechargeInteractionLockedSignal.value
      ) {
        timeout = window.setTimeout(resetSession, 120_000);
        return;
      }
      shopping.reset();
      resetPurchaseState();
      resetRechargeState();
      clearTicket();
      route(HOME_ROUTE_URL);
    }

    function refreshTimeout() {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(resetSession, 120_000);
    }

    window.addEventListener("keydown", refreshTimeout);
    window.addEventListener("pointerdown", refreshTimeout);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", refreshTimeout);
      window.removeEventListener("pointerdown", refreshTimeout);
    };
  }, []);

  return (
    <div class="w-screen h-screen flex flex-col overflow-hidden">
      <main class="flex-1 flex overflow-auto">{children}</main>
      <NavBar />
    </div>
  );
}
