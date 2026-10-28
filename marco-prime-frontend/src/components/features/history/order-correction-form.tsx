import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { apiHeaders, apiUrl } from "../../../config/api";
import { AdminAuthPanel } from "../auth/admin-auth-panel";
import { MemberProvider, useMember } from "../../../contexts/member-context";
import type { OrderSchema } from "../../../schemas/order.schema";
import {
  productCostListSchema,
  type ProductCost,
} from "../../../schemas/statistics.schema";
import { Button } from "../../ui/button";

interface OrderCorrectionFormProps {
  order: OrderSchema;
  onComplete: () => void;
}

export function OrderCorrectionForm(props: OrderCorrectionFormProps) {
  return (
    <MemberProvider>
      <OrderCorrectionEditor {...props} />
    </MemberProvider>
  );
}

function OrderCorrectionEditor({
  order,
  onComplete,
}: OrderCorrectionFormProps) {
  const { data: member, pause, resume, clear } = useMember();
  const [products, setProducts] = useState<ProductCost[]>([]);
  const [replacementProductId, setReplacementProductId] = useState(
    String(order.product?.id ?? ""),
  );
  const [replacementAmount, setReplacementAmount] = useState(
    String(order.amount),
  );
  const [reason, setReason] = useState("");
  const [productsLoading, setProductsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAdmin = member?.admin === true;

  useEffect(() => {
    if (isAdmin) pause();
    else resume();
  }, [isAdmin]);

  const changeAdministrator = () => {
    clear();
    resume();
  };

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setProductsLoading(true);
    setError(null);
    fetch(apiUrl("statistics/costs"), {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ adminCardNumber: member.cardNumber }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return productCostListSchema.parse(await response.json());
      })
      .then((catalogue) => {
        if (!cancelled) setProducts(catalogue);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger le catalogue Fouaille.");
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <section class="mt-6 border-t pt-5">
        <AdminAuthPanel
          title="Corriger cette vente"
          description="Carte, QR admin ou code manuel : choisissez la méthode. Le lecteur de carte reste actif en arrière-plan."
        />
      </section>
    );
  }

  const submit = async (cancel: boolean) => {
    const amount = Number(replacementAmount);
    if (
      !cancel &&
      (!Number.isInteger(amount) || amount < 1 || amount > 1000)
    ) {
      setError("La quantité doit être un nombre entier entre 1 et 1000.");
      return;
    }
    if (!cancel && !products.some((product) => product.id === Number(replacementProductId))) {
      setError("Choisissez un produit du catalogue.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Indiquez une raison d’au moins 3 caractères.");
      return;
    }
    if (
      !cancel &&
      Number(replacementProductId) === order.product?.id &&
      amount === order.amount
    ) {
      setError("Modifiez le produit ou la quantité avant d’enregistrer.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(apiUrl("order-corrections/apply"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          adminCardNumber: member.cardNumber,
          originalOrderId: order.id,
          replacementProductId: cancel
            ? null
            : Number(replacementProductId),
          replacementAmount: cancel ? 0 : amount,
          reason: reason.trim(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        throw new Error(
          body?.message ?? body?.error ?? `Erreur HTTP ${response.status}`,
        );
      }
      setSuccess(
        cancel
          ? "Vente annulée et montant recrédité."
          : "Vente corrigée et solde ajusté.",
      );
      window.setTimeout(onComplete, 700);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Correction impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  const preview = correctionPreview(
    order,
    products.find((product) => product.id === Number(replacementProductId)),
    Number(replacementAmount),
  );
  const availableProducts = products
    .filter((product) => product.available)
    .sort(compareProducts);
  const unavailableOriginal = products.find(
    (product) => !product.available && product.id === order.product?.id,
  );

  return (
    <section class="mt-6 border-t pt-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-xl font-bold">Corriger cette vente</h3>
          <p class="text-sm text-muted-foreground">
            Autorisé par {member.firstName} {member.lastName}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={changeAdministrator}>
          Changer d’administrateur
        </Button>
      </div>

      {productsLoading ? (
        <div class="flex justify-center p-8">
          <Loader2 class="size-9 animate-spin text-primary" />
        </div>
      ) : (
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-2 sm:col-span-2">
            Produit corrigé
            <select
              class="min-h-12 border bg-input px-3 py-2 text-lg"
              value={replacementProductId}
              onChange={(event) => {
                setReplacementProductId(event.currentTarget.value);
                setError(null);
              }}
            >
              <optgroup label="En vente actuellement">
                {availableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.sellingPrice} €
                  </option>
                ))}
              </optgroup>
              {unavailableOriginal && (
                <optgroup label="Produit original hors vente">
                  <option value={unavailableOriginal.id}>
                    {unavailableOriginal.name} · {unavailableOriginal.sellingPrice} €
                  </option>
                </optgroup>
              )}
            </select>
          </label>
          <label class="flex flex-col gap-2">
            Quantité corrigée
            <input
              type="number"
              min="1"
              max="1000"
              step="1"
              class="min-h-12 border bg-input px-3 py-2 text-lg"
              value={replacementAmount}
              onInput={(event) => {
                setReplacementAmount(event.currentTarget.value);
                setError(null);
              }}
            />
          </label>
          {preview && (
            <div class="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:col-span-2 sm:grid-cols-2">
              <div>
                <p class="text-sm text-muted-foreground">Avant</p>
                <p class="text-lg font-semibold">
                  {order.amount} × {order.product?.name}
                </p>
                <p class="text-sm">Débit : {preview.refunded}</p>
              </div>
              <div>
                <p class="text-sm text-muted-foreground">Après correction</p>
                <p class="text-lg font-semibold">
                  {preview.amount} × {preview.productName}
                </p>
                <p class="text-sm">Débit corrigé : {preview.charged}</p>
              </div>
              <p class="border-t pt-3 sm:col-span-2">
                Solde actuel : <strong>{preview.currentBalance}</strong>
                <span class="mx-2">→</span>
                Futur solde : <strong class={preview.insufficient ? "text-destructive" : ""}>{preview.futureBalance}</strong>
              </p>
              {preview.insufficient && (
                <p class="font-semibold text-destructive sm:col-span-2">
                  Correction impossible : le solde deviendrait négatif.
                </p>
              )}
            </div>
          )}
          <label class="flex flex-col gap-2 sm:col-span-2">
            Raison de la correction
            <textarea
              class="min-h-24 border bg-input px-3 py-3 text-lg"
              maxlength={250}
              value={reason}
              onInput={(event) => {
                setReason(event.currentTarget.value);
                setError(null);
              }}
              placeholder="Ex. une Primus saisie en trop"
            />
          </label>
        </div>
      )}

      {error && (
        <p class="mt-4 flex gap-2 text-destructive">
          <AlertTriangle class="shrink-0" /> {error}
        </p>
      )}
      {success && (
        <p class="mt-4 flex gap-2 text-green-400">
          <CheckCircle2 class="shrink-0" /> {success}
        </p>
      )}

      <div class="sticky bottom-0 z-10 -mx-1 mt-5 flex flex-wrap gap-3 border-t bg-card/95 px-1 py-4 backdrop-blur">
        <Button
          disabled={
            saving ||
            productsLoading ||
            products.length === 0 ||
            preview?.insufficient === true
          }
          onClick={() => void submit(false)}
        >
          {saving ? <Loader2 class="animate-spin" /> : <RotateCcw />}
          Enregistrer la correction
        </Button>
        <Button
          variant="destructive"
          disabled={saving}
          onClick={() => void submit(true)}
        >
          <XCircle /> Annuler et recréditer
        </Button>
      </div>
    </section>
  );
}

function correctionPreview(
  order: OrderSchema,
  product: ProductCost | undefined,
  amount: number,
) {
  if (!product || !Number.isInteger(amount) || amount < 1 || !order.member) {
    return null;
  }
  const originalCents = Math.abs(Math.round(Number(order.price) * 100));
  const currentBalanceCents = Math.round(Number(order.member.balance) * 100);
  if (!Number.isSafeInteger(originalCents) || !Number.isSafeInteger(currentBalanceCents)) {
    return null;
  }
  const unitCents =
    product.id === order.product?.id && originalCents % order.amount === 0
      ? originalCents / order.amount
      : Math.round(Number(product.sellingPrice) * 100);
  const chargedCents = unitCents * amount;
  const futureBalanceCents = currentBalanceCents + originalCents - chargedCents;
  return {
    amount,
    productName: product.name,
    refunded: `${(originalCents / 100).toFixed(2)} €`,
    charged: `${(chargedCents / 100).toFixed(2)} €`,
    currentBalance: `${(currentBalanceCents / 100).toFixed(2)} €`,
    futureBalance: `${(futureBalanceCents / 100).toFixed(2)} €`,
    insufficient:
      futureBalanceCents < 0 && futureBalanceCents < currentBalanceCents,
  };
}

function compareProducts(left: ProductCost, right: ProductCost) {
  return left.name.localeCompare(right.name, "fr", { sensitivity: "base" });
}
