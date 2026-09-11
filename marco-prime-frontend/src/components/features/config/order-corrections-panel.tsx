import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PencilLine,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { apiHeaders, apiUrl } from "../../../config/api";
import {
  correctionListSchema,
  type CorrectableOrder,
} from "../../../schemas/order-correction.schema";
import {
  catalogSelectionSchema,
  type CatalogSelectionProduct,
} from "../../../schemas/product.schema";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

interface OrderCorrectionsPanelProps {
  adminCardNumber: number;
}

export function OrderCorrectionsPanel({ adminCardNumber }: OrderCorrectionsPanelProps) {
  const [orders, setOrders] = useState<CorrectableOrder[]>([]);
  const [products, setProducts] = useState<CatalogSelectionProduct[]>([]);
  const [selected, setSelected] = useState<CorrectableOrder | null>(null);
  const [replacementProductId, setReplacementProductId] = useState("");
  const [replacementAmount, setReplacementAmount] = useState("1");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersResponse, productsResponse] = await Promise.all([
        fetch(apiUrl("order-corrections"), {
          method: "POST",
          headers: apiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ adminCardNumber, limit: 100 }),
        }),
        fetch(apiUrl("catalog-selection"), { headers: apiHeaders() }),
      ]);
      if (!ordersResponse.ok || !productsResponse.ok) throw new Error("HTTP error");
      setOrders(correctionListSchema.parse(await ordersResponse.json()));
      setProducts(catalogSelectionSchema.parse(await productsResponse.json()));
    } catch {
      setError("Impossible de charger les ventes récentes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [adminCardNumber]);

  const choose = (order: CorrectableOrder) => {
    if (order.correction) return;
    setSelected(order);
    setReplacementProductId(String(order.product.id));
    setReplacementAmount(String(order.amount));
    setReason("");
    setError(null);
    setSuccess(null);
  };

  const submit = async (cancel: boolean) => {
    if (!selected) return;
    const amount = Number(replacementAmount);
    if (!cancel && (!Number.isInteger(amount) || amount < 1 || amount > 1000)) {
      setError("La quantité doit être un nombre entier entre 1 et 1000.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Indiquez une raison d’au moins 3 caractères.");
      return;
    }
    if (!cancel && Number(replacementProductId) === selected.product.id && amount === selected.amount) {
      setError("Modifiez le produit ou la quantité avant d’enregistrer.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(apiUrl("order-corrections/apply"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          adminCardNumber,
          originalOrderId: selected.id,
          replacementProductId: cancel ? null : Number(replacementProductId),
          replacementAmount: cancel ? 0 : amount,
          reason: reason.trim(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
        throw new Error(body?.message ?? body?.error ?? `HTTP ${response.status}`);
      }
      setSuccess(cancel ? "Vente annulée et montant recrédité." : "Vente corrigée et solde ajusté.");
      setSelected(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Correction impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header class="flex items-center gap-4 border-b bg-card px-7 py-4">
        <div class="mr-auto">
          <h1 class="flex items-center gap-3 text-2xl font-bold"><PencilLine /> Corriger une vente</h1>
          <p class="text-muted-foreground">La vente d’origine est conservée. Marco rembourse puis applique la version corrigée.</p>
        </div>
        <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw class={loading ? "animate-spin" : ""} /> Actualiser</Button>
      </header>

      <div class="grid min-h-0 flex-1 gap-5 overflow-hidden p-6 lg:grid-cols-[1.4fr_1fr]">
        <Card class="min-h-0 overflow-y-auto p-0">
          {loading ? <div class="flex h-full items-center justify-center"><Loader2 class="size-12 animate-spin text-primary" /></div> : orders.map((order) => (
            <button
              type="button"
              key={order.id}
              disabled={order.correction !== null}
              onClick={() => choose(order)}
              class={`grid w-full grid-cols-[1fr_auto] gap-3 border-b p-4 text-left transition-colors ${selected?.id === order.id ? "bg-primary/15" : "hover:bg-accent"} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span>
                <span class="block text-lg font-semibold">{order.member ? `${order.member.firstName} ${order.member.lastName}` : "Membre inconnu"}</span>
                <span class="text-muted-foreground">{order.amount} × {order.product.name} · {new Date(order.date).toLocaleString("fr-FR")}</span>
              </span>
              <span class="flex items-center gap-2 font-bold">
                {order.correction?.status === "completed" && <><CheckCircle2 class="text-green-400" /> Corrigée</>}
                {order.correction?.status === "pending" && <><AlertTriangle class="text-amber-400" /> À vérifier</>}
                {!order.correction && `${Math.abs(Number(order.price)).toFixed(2)} €`}
              </span>
            </button>
          ))}
          {!loading && orders.length === 0 && <p class="p-8 text-center text-muted-foreground">Aucune vente récente.</p>}
        </Card>

        <Card class="self-start p-6">
          {selected ? <>
            <h2 class="text-xl font-bold">Vente #{selected.id}</h2>
            <p class="text-muted-foreground">Actuellement : {selected.amount} × {selected.product.name}</p>
            <label class="mt-5 flex flex-col gap-2">Produit corrigé
              <select class="border bg-input px-3 py-3 text-lg" value={replacementProductId} onChange={(event) => setReplacementProductId(event.currentTarget.value)}>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.price} €</option>)}
              </select>
            </label>
            <label class="mt-4 flex flex-col gap-2">Quantité corrigée
              <input type="number" min="1" max="1000" step="1" class="border bg-input px-3 py-3 text-lg" value={replacementAmount} onInput={(event) => setReplacementAmount(event.currentTarget.value)} />
            </label>
            <label class="mt-4 flex flex-col gap-2">Raison de la correction
              <textarea class="min-h-24 border bg-input px-3 py-3 text-lg" maxlength={250} value={reason} onInput={(event) => setReason(event.currentTarget.value)} placeholder="Ex. une Primus saisie en trop" />
            </label>
            <div class="mt-6 flex flex-wrap gap-3">
              <Button disabled={saving} onClick={() => void submit(false)}>{saving ? <Loader2 class="animate-spin" /> : <RotateCcw />} Enregistrer la correction</Button>
              <Button variant="destructive" disabled={saving} onClick={() => void submit(true)}><XCircle /> Annuler toute la vente</Button>
            </div>
          </> : <div class="py-10 text-center text-muted-foreground"><PencilLine class="mx-auto mb-4 size-12" /><p>Sélectionnez une vente non corrigée.</p></div>}
          {error && <p class="mt-5 flex gap-2 text-destructive"><AlertTriangle class="shrink-0" /> {error}</p>}
          {success && <p class="mt-5 flex gap-2 text-green-400"><CheckCircle2 class="shrink-0" /> {success}</p>}
        </Card>
      </div>
    </div>
  );
}
