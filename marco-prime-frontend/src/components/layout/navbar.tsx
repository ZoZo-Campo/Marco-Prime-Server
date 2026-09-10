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
    <nav class="flex items-center gap-3 w-full border-t bg-card">
      <NavButton href={HOME_ROUTE_URL} icon={Home} />
      <NavButton href={BUY_ROUTE_URL} label="Achats" icon={ShoppingCart} />
      <NavButton
        href={RECHARGE_ROUTE_URL}
        label="Rechargement"
        icon={ArrowLeftRight}
      />
      <NavButton href={CONFIG_ROUTE_URL} label="Config" icon={Wrench} />
      <SystemStatus />
      <NavButton href={HISTORY_ROUTE_URL} icon={ClockFading} />
    </nav>
  );
}
