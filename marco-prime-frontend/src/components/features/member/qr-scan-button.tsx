import { Check, QrCode, X } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useQrScanner } from "../../../hooks/use-qr-scanner";
import {
  isValidCardNumber,
  MAX_CARD_NUMBER_DIGITS,
} from "../../../constants";
import { playItemFeedback } from "../../../utils/scan-sound";
import { cn } from "../../../utils/cn";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

interface QrScanButtonProps {
  onSubmit: (cardNumber: string) => boolean | void;
  disabled?: boolean;
  label?: string;
  class?: string;
  variant?: "default" | "outline";
  onScanStart?: () => void;
  onScanEnd?: () => void;
  autoStart?: boolean;
}

/**
 * Le QR code contient le numéro de membre. On accepte le numéro brut ou un
 * texte (adresse, libellé) dans lequel on isole les chiffres.
 */
function cardNumberFromQr(text: string): string | null {
  const raw = text.trim();
  if (isValidCardNumber(raw)) return raw;

  const candidates = (raw.match(/\d+/g) ?? []).filter(
    (value) => value.length <= MAX_CARD_NUMBER_DIGITS,
  );
  return candidates.reduce<string | null>(
    (best, candidate) =>
      !best || candidate.length > best.length ? candidate : best,
    null,
  );
}

export function QrScanButton({
  onSubmit,
  disabled = false,
  label = "Scanner un QR code",
  class: className,
  variant = "outline",
  onScanStart,
  onScanEnd,
  autoStart = false,
}: QrScanButtonProps) {
  const [detected, setDetected] = useState(false);
  const startRef = useRef(onScanStart);
  const endRef = useRef(onScanEnd);
  startRef.current = onScanStart;
  endRef.current = onScanEnd;

  const scanner = useQrScanner((text) => {
    const cardNumber = cardNumberFromQr(text);
    if (!cardNumber) {
      setDetected(false);
      return;
    }
    playItemFeedback();
    setDetected(true);
    window.setTimeout(() => {
      setDetected(false);
      onSubmit(cardNumber);
    }, 50);
  });

  // Pré-ouvre la caméra dès l'affichage de l'écran pour un premier scan
  // instantané (le flux reste chaud ensuite, voir useQrScanner).
  useEffect(() => {
    scanner.warm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (autoStart) scanner.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!scanner.active) return;
    startRef.current?.();
    return () => endRef.current?.();
  }, [scanner.active]);

  return (
    <>
      <Button
        class={cn("mt-3 w-full", className)}
        type="button"
        variant={variant}
        onClick={scanner.start}
        disabled={disabled || !scanner.supported}
      >
        <QrCode /> {label}
      </Button>

      {!scanner.supported && (
        <p class="mt-2 text-center text-xs text-muted-foreground">
          Lecture de QR indisponible sur cet appareil.
        </p>
      )}
      {scanner.error && !scanner.active && (
        <p class="mt-2 text-center text-sm text-destructive">{scanner.error}</p>
      )}

      <div
        aria-hidden={!scanner.active}
        class={cn(
          "fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm transition-opacity duration-150",
          !scanner.active && "pointer-events-none opacity-0",
        )}
      >
        <Card class="w-full max-w-xl gap-4 overflow-hidden py-5">
          <div class="flex items-center justify-between gap-4 px-5">
            <h2 class="flex items-center gap-2 text-xl font-bold">
              <QrCode class="size-6 text-primary" />
              Scanner un QR code
            </h2>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Fermer"
              onClick={scanner.stop}
            >
              <X />
            </Button>
          </div>

          <div class="px-5">
            <div class="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl border-2 border-primary/40 bg-black shadow-inner">
              <video
                ref={scanner.videoRef}
                class="h-full w-full object-cover"
                autoPlay
                playsInline
                muted
              />

              <div class="pointer-events-none absolute inset-0">
                <span class="absolute left-3 top-3 size-9 rounded-tl-2xl border-l-4 border-t-4 border-primary" />
                <span class="absolute right-3 top-3 size-9 rounded-tr-2xl border-r-4 border-t-4 border-primary" />
                <span class="absolute bottom-3 left-3 size-9 rounded-bl-2xl border-b-4 border-l-4 border-primary" />
                <span class="absolute bottom-3 right-3 size-9 rounded-br-2xl border-b-4 border-r-4 border-primary" />
                <span class="qr-scanline absolute inset-x-8 top-1/3 h-0.5 rounded-full bg-primary shadow-[0_0_14px_3px_var(--color-primary)]" />
              </div>

              <div
                class={cn(
                  "pointer-events-none absolute inset-0 flex items-center justify-center bg-green-500/30 transition-opacity duration-200",
                  detected ? "opacity-100" : "opacity-0",
                )}
              >
                <span class="flex size-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg">
                  <Check class="size-9" />
                </span>
              </div>
            </div>

            <p class="mt-4 text-center text-sm text-muted-foreground">
              Présentez le QR code de la personne devant la caméra.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
