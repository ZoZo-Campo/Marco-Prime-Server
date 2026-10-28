import type { ComponentChild } from "preact";
import { useLocation } from "preact-iso";
import { ArrowLeftRight, ScanLine } from "lucide-preact";
import { BUY_ROUTE_URL } from "./buy";
import { RECHARGE_ROUTE_URL } from "./recharge";
import { shopping } from "../contexts/shopping-context";
import { resetPurchaseState } from "../contexts/purchase-state";
import { resetRechargeState } from "../contexts/recharge-state";
import { haptic, ripple } from "../utils/feedback";

export const HOME_ROUTE_URL = "/";

export function HomePage() {
  const { route } = useLocation();

  function start(href: string) {
    shopping.reset();
    resetPurchaseState();
    resetRechargeState();
    route(href);
  }

  return (
    <div class="flex-1 min-h-0 flex flex-col">
      <div class="flex flex-1 min-h-0 flex-col items-center justify-center gap-5 px-4 py-6 sm:gap-7 sm:px-8">
        {/* Logo */}
        <img
          src="/marco.svg"
          alt="Marco Prime"
          class="h-24 drop-shadow-[0_0_24px_var(--color-glow)] sm:h-36 md:h-44"
        />

        {/* CTA principal : la carte RFID, c'est le vrai point d'entrée */}
        <button
          type="button"
          onClick={(event) => {
            ripple(event, "var(--color-primary-foreground)");
            haptic(20);
            start(BUY_ROUTE_URL);
          }}
          class="relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl bg-primary px-8 py-6 text-primary-foreground shadow-xl hover:brightness-110 active:scale-[0.98] sm:px-14 sm:py-8"
        >
          <ScanLine class="size-14" />
          <span class="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">
            Scannez votre carte
          </span>
          <span class="text-base font-medium opacity-80">
            ou touchez pour commencer
          </span>
        </button>

        {/* Raccourci secondaire */}
        <QuickAction
          icon={<ArrowLeftRight class="size-7" />}
          label="Recharger un compte"
          onClick={() => start(RECHARGE_ROUTE_URL)}
        />

        {/* Crédits */}
        <div class="flex items-end gap-2 opacity-70">
          <span class="text-xs font-medium">Powered by</span>
          <img
            src="/enzo-romain.png"
            alt="Enzo et Romain"
            class="h-14 w-auto object-contain sm:h-16"
          />
        </div>
      </div>

      <footer class="shrink-0 px-4 pb-3 text-center text-xs font-medium text-muted-foreground">
        <span class="block">
          © {new Date().getFullYear()} Enzo Campofranco &amp; Romain Bourdinho ·
          Marco Prime
        </span>
        <span class="block text-[11px] opacity-70">
          L’homme de la situation · L’inoubliable
        </span>
      </footer>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: ComponentChild;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        ripple(event, "currentColor");
        haptic(15);
        onClick();
      }}
      class="relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-card px-5 py-3.5 text-base font-semibold shadow-md hover:bg-accent active:scale-[0.98] sm:px-7 sm:py-4 sm:text-lg"
    >
      {icon}
      {label}
    </button>
  );
}
