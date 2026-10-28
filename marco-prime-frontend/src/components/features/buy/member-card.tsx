import { useEffect, useRef, useState } from "preact/hooks";
import type z from "zod";
import { RefreshCw, ScanLine, ShieldAlert } from "lucide-preact";
import { useMember } from "../../../contexts/member-context";
import { shopping } from "../../../contexts/shopping-context";
import { cn } from "../../../utils/cn";
import { formatEuro } from "../../../utils/format";
import { hasInsufficientBalance } from "../../../utils/validation";
import { playScanFeedback } from "../../../utils/scan-sound";
import type { memberSchema } from "../../../schemas/member.schema";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Skeleton } from "../../ui/skeleton";
import { MemberSearch } from "../member/member-search";
import { BirthdayBadge } from "../member/birthday-badge";

export function MemberCard() {
  const { data, loading, error, inputLength, retry, clear } = useMember();
  const flashRef = useRef<HTMLDivElement>(null);
  const lastStateKey = useRef<string>("");

  useEffect(() => {
    const stateKey = error ? "error" : data ? "ok" : "idle";
    if (stateKey === lastStateKey.current) return;
    lastStateKey.current = stateKey;
    if (stateKey === "ok") {
      playScanFeedback("ok");
      flash("success");
    } else if (stateKey === "error") {
      playScanFeedback("error");
      flash("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data, error]);

  function flash(kind: "success" | "error") {
    const el = flashRef.current;
    if (!el) return;
    el.className =
      `pointer-events-none fixed inset-0 z-[100] ${kind === "success" ? "bg-green-500/20" : "bg-red-500/25"}`;
    requestAnimationFrame(() => {
      el.className = `${el.className} scanflash-anim`;
    });
    window.setTimeout(() => {
      el.className = "pointer-events-none fixed inset-0 z-[100] opacity-0";
    }, 450);
  }

  let content;
  if (loading) content = <MemberCardLoading />;
  else if (error) content = <MemberCardError retry={retry} clear={clear} />;
  else if (!data) content = <NoMemberCard inputLength={inputLength} />;
  else content = <MemberCardLoaded key={data.id} member={data} clear={clear} />;

  return (
    <>
      <div ref={flashRef} class="pointer-events-none fixed inset-0 z-[100] opacity-0" />
      {content}
    </>
  );
}

function MemberCardError({
  retry,
  clear,
}: {
  retry: () => Promise<void>;
  clear: () => void;
}) {
  return (
    <div class="space-y-2">
      <Alert variant="destructive">
        <AlertTitle>Carte non reconnue</AlertTitle>
        <AlertDescription class="flex flex-col gap-2">
          <span>Vérifiez la carte ou la connexion au serveur.</span>
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void retry()}>
              Réessayer
            </Button>
            <Button size="sm" onClick={clear}>Autre carte</Button>
          </div>
        </AlertDescription>
      </Alert>
      <MemberSearch />
    </div>
  );
}

function NoMemberCard({ inputLength }: { inputLength: number }) {
  return (
    <div class="rounded-2xl border border-dashed p-5 text-center">
      <ScanLine class="mx-auto size-7 text-muted-foreground" />
      <p class="mt-2 text-sm font-medium text-muted-foreground">
        {inputLength > 0
          ? `Saisie en cours : ${inputLength} chiffre${inputLength > 1 ? "s" : ""}. Appuyez sur Entrée.`
          : "Scannez une carte ou saisissez son numéro puis Entrée."}
      </p>
      <MemberSearch />
    </div>
  );
}

function MemberCardLoaded({
  member,
  clear,
}: {
  member: z.infer<typeof memberSchema>;
  clear: () => void;
}) {
  const nonContributor = member.contributor === false;
  const [showWarning, setShowWarning] = useState(nonContributor);
  const notEnoughMoney = hasInsufficientBalance(
    shopping.total.value,
    member.balance,
  );
  const missingAmount = Math.max(
    0,
    Math.round((shopping.total.value - Number(member.balance)) * 100) / 100,
  );
  const initials =
    `${member.firstName?.[0] ?? ""}${member.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <div class="rounded-2xl border bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-4 shadow-sm">
      <div class="flex items-center gap-3">
        <div class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/20 text-lg font-extrabold text-primary">
          {initials || "?"}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-lg font-bold leading-tight">
            {member.firstName} {member.lastName}
          </p>
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Solde
          </p>
        </div>
        <strong
          class={cn(
            "text-2xl font-extrabold tabular-nums",
            notEnoughMoney ? "text-destructive" : "text-success",
          )}
        >
          {formatEuro(member.balance)}
        </strong>
      </div>

      {nonContributor && (
        <p class="mt-2 rounded-xl border border-destructive/50 bg-destructive/15 px-3 py-2 text-sm font-bold text-destructive">
          Ce membre n’a pas cotisé.
        </p>
      )}

      {member.isBirthday && (
        <div class="mt-2">
          <BirthdayBadge firstName={member.firstName} />
        </div>
      )}

      {notEnoughMoney && (
        <p class="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
          Paiement impossible — il manque {formatEuro(missingAmount)}.
        </p>
      )}

      <Button
        class="mt-3 w-full rounded-xl"
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          shopping.reset();
          clear();
        }}
      >
        <RefreshCw class="size-4" /> Changer de membre
      </Button>

      {showWarning && (
        <div class="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4" role="presentation">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="non-contributor-title"
            class="w-full max-w-xl rounded-2xl border-2 border-destructive bg-card p-6 shadow-2xl"
          >
            <div class="flex items-start gap-4">
              <span class="flex size-14 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
                <ShieldAlert class="size-8" />
              </span>
              <div>
                <h2 id="non-contributor-title" class="text-2xl font-extrabold text-destructive">
                  Ce membre n’a pas cotisé
                </h2>
                <p class="mt-2 text-lg">
                  Voulez-vous vraiment servir <strong>{member.firstName} {member.lastName}</strong> ?
                </p>
                <p class="mt-1 text-sm">
                  Solde actuel : <strong>{formatEuro(member.balance)}</strong>
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                  La cotisation n’est pas enregistrée pour ce membre. Vous pouvez continuer exceptionnellement, ou annuler et changer de membre.
                </p>
              </div>
            </div>
            <div class="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  setShowWarning(false);
                  shopping.reset();
                  clear();
                }}
              >
                Non, ne pas servir
              </Button>
              <Button
                variant="destructive"
                size="lg"
                onClick={() => setShowWarning(false)}
              >
                Oui, servir quand même
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberCardLoading() {
  return (
    <div class="flex items-center gap-3 rounded-2xl border p-4">
      <Skeleton class="size-12 rounded-full" />
      <div class="flex-1 space-y-2">
        <Skeleton class="h-5 w-32" />
        <Skeleton class="h-4 w-16" />
      </div>
    </div>
  );
}
