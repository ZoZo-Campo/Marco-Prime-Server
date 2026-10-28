import type { LucideIcon } from "lucide-preact";
import { useLocation } from "preact-iso";
import { cn } from "../../../utils/cn";
import { haptic, ripple } from "../../../utils/feedback";
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
    <button
      type="button"
      disabled={interactionLocked}
      onClick={(event) => {
        if (interactionLocked) return;
        ripple(event, "currentColor");
        haptic(10);
        if (path === BUY_ROUTE_URL && href !== BUY_ROUTE_URL) {
          shopping.reset();
          resetPurchaseState();
        }
        resetRechargeState();
        route(href);
      }}
      class={cn(
        "relative overflow-hidden flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-base font-semibold sm:px-4",
        isActive
          ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_var(--color-glow)]"
          : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
        "disabled:opacity-40 disabled:pointer-events-none",
      )}
      aria-current={isActive ? "page" : undefined}
      aria-label={label}
      title={label}
    >
      <Icon class="size-6 shrink-0" />
      {label && <span class="hidden md:inline">{label}</span>}
    </button>
  );
}
