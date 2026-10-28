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

/** Retour à l'accueil après inactivité (l'accueil fait office d'écran d'attente). */
const IDLE_RESET_MS = 120_000;

export function Layout({ children }: LayoutProps) {
  const { path, route } = useLocation();

  // Garde anti-clavier : quand le clavier se rétracte, Chrome peut laisser le
  // viewport décalé vers le bas (liseré en haut + clavier qui rejaillit au
  // prochain tap). On recentre le scroll dès que le clavier disparaît, y
  // compris après un simple blur (focusout), sans attendre un tap ailleurs.
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;
    let fullHeight = Math.max(window.innerHeight, visualViewport.height);
    let keyboardVisible = false;

    const resetPageScroll = () => {
      window.scrollTo(0, 0);
      const scrollingElement = document.scrollingElement;
      if (scrollingElement) scrollingElement.scrollTop = 0;
    };

    const onResize = () => {
      const currentInner = window.innerHeight;
      if (currentInner > fullHeight) fullHeight = currentInner;
      const hasKeyboard = fullHeight - visualViewport.height > 120;
      if (hasKeyboard) {
        keyboardVisible = true;
      } else if (keyboardVisible) {
        keyboardVisible = false;
        resetPageScroll();
      }
    };

    const onScroll = () => {
      if (!keyboardVisible && visualViewport.offsetTop > 0) {
        resetPageScroll();
      }
    };

    const onFocusOut = () => {
      window.setTimeout(() => {
        if (!keyboardVisible) resetPageScroll();
      }, 80);
    };

    visualViewport.addEventListener("resize", onResize);
    visualViewport.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      visualViewport.removeEventListener("resize", onResize);
      visualViewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    let timeout = window.setTimeout(resetSession, IDLE_RESET_MS);

    function resetSession() {
      if (
        purchaseInteractionLockedSignal.value ||
        rechargeInteractionLockedSignal.value
      ) {
        timeout = window.setTimeout(resetSession, IDLE_RESET_MS);
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
      timeout = window.setTimeout(resetSession, IDLE_RESET_MS);
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
    <div class="app-shell w-screen flex flex-col overflow-hidden">
      <main key={path} class="flex-1 flex min-h-0 overflow-auto view-enter">
        {children}
      </main>
      <NavBar />
    </div>
  );
}
