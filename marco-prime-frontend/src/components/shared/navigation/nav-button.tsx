import type { LucideIcon } from "lucide-preact";
import { useLocation } from "preact-iso";
import { cn } from "../../../utils/cn";
import { Button } from "../../ui/button";
import { shopping } from "../../../contexts/shopping-context";
import {
  purchaseInteractionLockedSignal,
  resetPurchaseState,
} from "../../../contexts/purchase-state";
import { BUY_ROUTE_URL } from "../../../pages/buy";
import {
  rechargeInteractionLockedSignal,
  resetRechargeState,
} from "../../../contexts/recharge-state";

interface NavButtonProps {
  icon: LucideIcon;
  label?: string;
  href: string;
}

export function NavButton({ icon: Icon, label, href }: NavButtonProps) {
  const { path, route } = useLocation();
  const isActive = path === href;
  const interactionLocked =
    purchaseInteractionLockedSignal.value ||
    rechargeInteractionLockedSignal.value;

  return (
    <Button
      class={cn(label && "flex-1", isActive && "text-primary hover:text-primary")}
      variant="ghost"
      size="lg"
      disabled={interactionLocked}
      onClick={() => {
        if (interactionLocked) return;
        if (path === BUY_ROUTE_URL && href !== BUY_ROUTE_URL) {
          shopping.reset();
          resetPurchaseState();
        }
        resetRechargeState();
        route(href);
      }}
    >
      <Icon />
      {label && <span>{label}</span>}
    </Button>
  );
}
