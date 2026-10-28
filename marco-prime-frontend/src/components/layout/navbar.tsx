import {
  ArrowLeftRight,
  ClockFading,
  Home,
  ShoppingCart,
  Wrench,
} from "lucide-preact";
import { BUY_ROUTE_URL } from "../../pages/buy";
import { CONFIG_ROUTE_URL } from "../../pages/config";
import { HOME_ROUTE_URL } from "../../pages/home";
import { HISTORY_ROUTE_URL } from "../../pages/history";
import { RECHARGE_ROUTE_URL } from "../../pages/recharge";
import { NavButton } from "../shared/navigation/nav-button";
import { SystemStatus } from "../features/system/system-status";

export function NavBar() {
  return (
    <nav
      class="shrink-0 px-2 pt-2 sm:px-3"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      <div class="flex w-full items-center gap-1 rounded-2xl border bg-card/70 px-1.5 py-1.5 shadow-lg backdrop-blur-md sm:gap-1.5 sm:px-2.5 sm:py-2">
        <NavButton href={HOME_ROUTE_URL} label="Accueil" icon={Home} />
        <NavButton href={BUY_ROUTE_URL} label="Achats" icon={ShoppingCart} />
        <NavButton href={RECHARGE_ROUTE_URL} label="Recharger" icon={ArrowLeftRight} />
        <NavButton href={CONFIG_ROUTE_URL} label="Config" icon={Wrench} />
        <div class="flex-1" />
        <div class="hidden md:block">
          <SystemStatus />
        </div>
        <NavButton href={HISTORY_ROUTE_URL} label="Historique" icon={ClockFading} />
      </div>
    </nav>
  );
}
