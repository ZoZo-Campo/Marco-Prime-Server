import { Check } from "lucide-preact";
import { useState } from "preact/hooks";
import { MAX_CARD_NUMBER_DIGITS } from "../../../constants";
import { Button } from "../../ui/button";
import { Keypad } from "../recharge/keypad";

interface CardCodeEntryProps {
  onSubmit: (cardNumber: string) => boolean | void;
  disabled?: boolean;
  title?: string;
}

export function CardCodeEntry({
  onSubmit,
  disabled = false,
  title = "Numéro de carte",
}: CardCodeEntryProps) {
  const [code, setCode] = useState("");

  const submit = () => {
    if (code.length < 1 || disabled) return;
    if (onSubmit(code) !== false) setCode("");
  };

  return (
    <div class="flex flex-col gap-3">
      <div class="flex h-14 items-center justify-between gap-3 rounded-lg border bg-background px-4">
        <span class="shrink-0 text-xs font-semibold text-muted-foreground">
          {title}
        </span>
        <span class="min-h-8 flex-1 rounded bg-muted px-3 py-1 text-center font-mono text-xl font-bold tracking-[0.35em]">
          {code.split("").join(" ")}
        </span>
      </div>
      <div class="w-72 self-center">
        <Keypad
          value={code}
          onChange={setCode}
          maxLength={MAX_CARD_NUMBER_DIGITS}
          disabled={disabled}
        />
      </div>
      <Button class="h-12 w-full" type="button" onClick={submit} disabled={disabled || code.length < 1}>
        <Check class="size-5" /> Valider
      </Button>
    </div>
  );
}