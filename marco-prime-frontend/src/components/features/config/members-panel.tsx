import { useEffect, useState } from "preact/hooks";
import { Button } from "../../ui/button";
import { Keypad } from "../recharge/keypad";
import { adminJson } from "./admin-api";

type Promotion = { promotion: number; total: number };
type ManagedMember = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  cardNumber: number | null;
  balance: string;
  promotion: number | null;
  admin: boolean;
};

export function MembersPanel({ adminCardNumber }: { adminCardNumber: number }) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [query, setQuery] = useState("");
  const [promotion, setPromotion] = useState("");
  const [results, setResults] = useState<ManagedMember[]>([]);
  const [selected, setSelected] = useState<ManagedMember | null>(null);
  const [badge, setBadge] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [newPromotion, setNewPromotion] = useState("");
  const [newBadge, setNewBadge] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    adminJson<Promotion[]>("admin/promotions", { adminCardNumber })
      .then(setPromotions).catch(() => setError("Promotions indisponibles."));
  }, [adminCardNumber, revision]);

  useEffect(() => {
    if (query.trim().length < 2 && !promotion) {
      setResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      adminJson<ManagedMember[]>("admin/members/search", {
        adminCardNumber, query: query.trim(),
        ...(promotion ? { promotion: Number(promotion) } : {}),
      }).then((rows) => { if (active) setResults(rows); })
        .catch((cause: Error) => { if (active) setError(cause.message); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [adminCardNumber, query, promotion, revision]);

  const saveBadge = async () => {
    if (!selected || !/^\d{1,16}$/.test(badge) || !Number.isSafeInteger(Number(badge)) || Number(badge) <= 0) {
      setError("Saisissez un numéro de badge valide.");
      return;
    }
    if (Number(badge) === selected.cardNumber) return;
    if (!window.confirm(`Remplacer le badge de ${selected.firstName} ${selected.lastName} ? L’ancien badge sera désactivé. Le solde et l’historique resteront inchangés.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminJson("admin/members/badge", {
        adminCardNumber, memberId: selected.id,
        expectedCardNumber: selected.cardNumber, newCardNumber: Number(badge),
      }, "PUT");
      setSelected({ ...selected, cardNumber: Number(badge) });
      setNotice("Badge enregistré. Ancien badge désactivé.");
      setRevision((value) => value + 1);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const createMember = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.includes("@")) {
      setError("Prénom, nom et adresse e-mail valides sont obligatoires dans Fouaille.");
      return;
    }
    if (newBadge && (!/^\d{1,16}$/.test(newBadge) || !Number.isSafeInteger(Number(newBadge)) || Number(newBadge) <= 0)) {
      setError("Le numéro de badge n’est pas valide.");
      return;
    }
    if (!window.confirm(`Créer ${firstName.trim()} ${lastName.trim()} dans Fouaille Manager ?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminJson("admin/members", {
        adminCardNumber, firstName: firstName.trim(), lastName: lastName.trim(),
        email: email.trim(), promotion: newPromotion ? Number(newPromotion) : null,
        cardNumber: newBadge ? Number(newBadge) : null,
      });
      setNotice("Membre créé dans Fouaille. Solde initial : 0 €.");
      setQuery(lastName.trim()); setCreating(false);
      setFirstName(""); setLastName(""); setEmail(""); setNewBadge("");
      setRevision((value) => value + 1);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  return <div class="min-h-0 flex-1 overflow-y-auto p-4 md:p-7">
    <h1 class="text-2xl font-bold">Membres Fouaille</h1>
    <p class="mt-1 text-muted-foreground">Recherche par nom et promotion. Création et badges sont enregistrés dans la base Fouaille, pas seulement sur cette Marco.</p>
    {error && <p role="alert" class="mt-3 rounded border border-destructive p-3 text-destructive">{error}</p>}
    {notice && <p role="status" class="mt-3 rounded border border-green-500 p-3 text-green-400">{notice}</p>}
    <div class="mt-5 flex flex-wrap gap-3">
      <input class="min-h-12 flex-1 rounded border bg-background px-3 text-lg" placeholder="Nom ou prénom" value={query}
        onInput={(event) => setQuery(event.currentTarget.value)} />
      <select class="min-h-12 rounded border bg-background px-3" value={promotion}
        onChange={(event) => setPromotion(event.currentTarget.value)}>
        <option value="">Toutes les promotions</option>
        {promotions.map((row) => <option key={row.promotion} value={row.promotion}>{row.promotion} ({row.total})</option>)}
      </select>
      <Button onClick={() => { setCreating(!creating); setSelected(null); setError(""); }}> {creating ? "Annuler" : "Créer un membre"} </Button>
    </div>
    {creating ? <div class="mt-5 grid max-w-3xl gap-3 rounded border bg-card p-4 md:grid-cols-2">
      <h2 class="md:col-span-2 text-xl font-semibold">Nouveau membre</h2>
      <input class="min-h-12 rounded border bg-background px-3" placeholder="Prénom *" value={firstName} onInput={(event) => setFirstName(event.currentTarget.value)} />
      <input class="min-h-12 rounded border bg-background px-3" placeholder="Nom *" value={lastName} onInput={(event) => setLastName(event.currentTarget.value)} />
      <input class="min-h-12 rounded border bg-background px-3" type="email" placeholder="Adresse e-mail *" value={email} onInput={(event) => setEmail(event.currentTarget.value)} />
      <select class="min-h-12 rounded border bg-background px-3" value={newPromotion} onChange={(event) => setNewPromotion(event.currentTarget.value)}>
        <option value="">Promotion non renseignée</option>
        {promotions.map((row) => <option key={row.promotion} value={row.promotion}>{row.promotion}</option>)}
      </select>
      <input class="min-h-12 rounded border bg-background px-3" inputMode="numeric" placeholder="Badge (facultatif)" value={newBadge} onInput={(event) => setNewBadge(event.currentTarget.value.replace(/\D/g, ""))} />
      <Button disabled={busy} onClick={() => void createMember()}>Créer dans Fouaille</Button>
    </div> : <div class="mt-4 grid gap-2">
      {results.map((person) => <button key={person.id} type="button" class="min-h-16 rounded border bg-card p-3 text-left hover:bg-accent"
        onClick={() => { setSelected(person); setBadge(person.cardNumber?.toString() ?? ""); }}>
        <strong>{person.firstName} {person.lastName}</strong> · {person.promotion ?? "Sans promotion"} · {person.cardNumber ? `badge ${person.cardNumber}` : "Sans badge"}
      </button>)}
      {!results.length && (query.trim().length >= 2 || promotion) && <p class="text-muted-foreground">Aucun membre trouvé.</p>}
      {results.length === 30 && <p class="text-sm text-muted-foreground">Seuls les 30 premiers résultats sont affichés. Précisez le nom pour affiner.</p>}
      {selected && <div class="mt-3 max-w-xl rounded border border-primary bg-card p-4">
        <h2 class="text-xl font-semibold">{selected.firstName} {selected.lastName}</h2>
        <p>{selected.email} · Solde {selected.balance} €</p>
        <p class="mt-2 text-sm text-muted-foreground">Le remplacement ne touche ni au solde ni aux ventes.</p>
        <label class="mt-4 block">{selected.cardNumber ? "Nouveau numéro de badge" : "Attribuer un badge"}</label>
        <input class="mt-1 min-h-12 w-full rounded border bg-background px-3 text-xl" inputMode="numeric" value={badge}
          onInput={(event) => setBadge(event.currentTarget.value.replace(/\D/g, ""))} />
        <details class="mt-2"><summary>Pavé tactile</summary><div class="max-w-xs"><Keypad value={badge} onChange={setBadge} maxLength={16} /></div></details>
        <Button class="mt-3" disabled={busy || !badge || Number(badge) === selected.cardNumber} onClick={() => void saveBadge()}>Enregistrer le badge</Button>
      </div>}
    </div>}
  </div>;
}
