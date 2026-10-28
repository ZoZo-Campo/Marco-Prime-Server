import { Check, Loader2, Search, UserRoundSearch, X } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { apiHeaders, apiUrl } from "../../../config/api";
import { useMember } from "../../../contexts/member-context";
import { shopping } from "../../../contexts/shopping-context";
import { memberListSchema, type MemberSchema } from "../../../schemas/member.schema";
import { loadRecentMembers } from "../../../utils/recent-members";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { QrScanButton } from "./qr-scan-button";
export function MemberSearch() {
  const { pause, resume, submitCardNumber } = useMember();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [promotion, setPromotion] = useState("");
  const [promotions, setPromotions] = useState<number[]>([]);
  const [results, setResults] = useState<MemberSchema[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<MemberSchema[]>([]);
  const [modalHeight, setModalHeight] = useState(() => window.innerHeight - 24);
  const [overlayTop, setOverlayTop] = useState(0);

  const show = () => {
    pause();
    setOpen(true);
    setQuery("");
    setPromotion("");
    setResults([]);
    setError(null);
    setRecent(loadRecentMembers());
  };

  const close = () => {
    setOpen(false);
    resume();
  };

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const viewport = window.visualViewport;
      const viewportHeight = viewport
        ? Math.round(viewport.height)
        : Math.round(window.innerHeight);
      const offsetTop = viewport ? Math.round(viewport.offsetTop) : 0;
      setModalHeight((current) => {
        const next = Math.max(320, viewportHeight - 24);
        return Math.abs(current - next) > 1 ? next : current;
      });
      setOverlayTop(offsetTop);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("focusout", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    const timer = window.setInterval(measure, 400);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("focusout", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      window.clearInterval(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch(apiUrl("member-promotions"), { headers: apiHeaders() })
      .then((response) => response.json())
      .then((rows: { class: number }[] | number[]) => {
        if (Array.isArray(rows)) {
          setPromotions(
            rows.map((row) => (typeof row === "number" ? row : row.class)).filter((n) => typeof n === "number"),
          );
        }
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || (trimmed.length < 1 && !promotion)) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError(null);
      fetch(apiUrl("members/search"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ query: trimmed, ...(promotion ? { promotion: Number(promotion) } : {}) }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Erreur ${response.status}`);
          return memberListSchema.parse(await response.json());
        })
        .then(setResults)
        .catch((cause) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          setError("Impossible de rechercher les membres.");
        })
        .finally(() => setSearching(false));
    }, 150);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, promotion]);

  const choose = (member: MemberSchema) => {
    shopping.reset();
    // Ne jamais réutiliser l'objet des « membres récents » : son solde peut
    // dater d'avant un rechargement. On refetch toujours la fiche à jour.
    submitCardNumber(String(member.cardNumber));
    resume();
    setOpen(false);
  };

  return (
    <>
      <Button class="mt-3 w-full" type="button" variant="outline" onClick={show}>
        <UserRoundSearch /> Rechercher un membre
      </Button>
      <QrScanButton
        onSubmit={(cardNumber) => submitCardNumber(cardNumber)}
        onScanStart={pause}
        onScanEnd={resume}
      />
      {open && (
        <div
          class="fixed z-50 flex flex-col items-center bg-black/75 p-3"
          style={{ top: overlayTop, left: 0, right: 0, height: modalHeight + 24 }}
        >
          <Card class="flex w-full max-w-4xl flex-col overflow-hidden px-5 py-3 shadow-2xl" style={{ maxHeight: Math.max(320, modalHeight) }}>
            <div class="flex shrink-0 items-center justify-between gap-4">
              <div>
                <h2 class="text-2xl font-bold">Rechercher un membre</h2>
                <p class="text-sm text-muted-foreground">
                  Par nom, prénom, promotion ou numéro de carte.
                </p>
              </div>
              <Button size="icon" variant="ghost" aria-label="Fermer" onClick={close}>
                <X />
              </Button>
            </div>

            <div class="mt-3 flex min-h-0 flex-1 flex-col gap-3">
              <div class="flex shrink-0 items-center gap-3 rounded-lg border bg-background px-4">
                <Search class="text-muted-foreground" />
                <input
                  class="h-14 min-w-0 flex-1 bg-transparent text-xl outline-none"
                  value={query}
                  autocomplete="off"
                  autoFocus
                  placeholder="Prénom, nom ou numéro de carte…"
                  aria-label="Nom ou numéro de carte"
                  onInput={(event) => setQuery(event.currentTarget.value)}
                />
                {searching && <Loader2 class="animate-spin text-primary" />}
              </div>
              <label class="flex shrink-0 items-center gap-3 text-lg">
                Promotion
                <select class="min-h-12 flex-1 rounded-lg border bg-background px-3" value={promotion}
                  onChange={(event) => setPromotion(event.currentTarget.value)}>
                  <option value="">Toutes les promotions</option>
                  {promotions.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>

              {recent.length > 0 && query.trim().length < 1 && !promotion && (
                <div class="shrink-0">
                  <p class="mb-1.5 text-sm font-semibold text-muted-foreground">
                    Membres récents
                  </p>
                  <div class="flex flex-wrap gap-2">
                    {recent.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        class="flex min-h-11 items-center gap-2 rounded-full border bg-background px-4 py-2 text-left hover:bg-accent"
                        onClick={() => choose(member)}
                      >
                        <UserRoundSearch class="size-4 text-primary" />
                        <span class="text-base font-semibold">
                          {member.firstName} {member.lastName}
                        </span>
                        <span class="text-sm text-muted-foreground">
                          {member.class ? `Promo ${member.class}` : ""} · Solde {member.balance}€
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div class="min-h-16 flex-1 overflow-y-auto rounded-lg border bg-background">
                {error && (
                  <p class="border-b p-4 text-destructive">{error}</p>
                )}
                {query.trim().length < 1 && !promotion ? (
                  <p class="p-6 text-center text-muted-foreground">
                    Saisissez un nom, un numéro de carte ou choisissez une promotion.
                  </p>
                ) : !searching && results.length === 0 && !error ? (
                  <p class="p-6 text-center text-muted-foreground">
                    Aucun membre trouvé.
                  </p>
                ) : (
                  results.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      class="flex min-h-14 w-full items-center gap-4 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent"
                      onClick={() => choose(member)}
                    >
                      <span class="text-lg font-semibold">
                        {member.firstName} {member.lastName}
                      </span>
                      <span class="ml-auto text-muted-foreground">
                        {member.class ? `Promo ${member.class} · ` : ""}Solde {member.balance} €
                      </span>
                      <Check class="text-primary" />
                    </button>
                  ))
                )}
              </div>

              
            </div>
          </Card>
        </div>
      )}
    </>
  );
}