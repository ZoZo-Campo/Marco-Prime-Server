import { useLocation } from "preact-iso";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-preact";
import { shopping } from "../../../contexts/shopping-context";
import { useMember } from "../../../contexts/member-context";
import { setTicket } from "../../../contexts/ticket-context";
import { purchaseResponseSchema } from "../../../schemas/purchase.schema";
import { TICKET_ROUTE_URL } from "../../../pages/ticket";
import { Button } from "../../ui/button";
import { apiHeaders, apiUrl } from "../../../config/api";
import {
  pendingPurchaseSignal,
  purchaseErrorSignal,
  purchaseInProgressSignal,
  purchaseInteractionLockedSignal,
  resetPurchaseState,
  type PendingPurchase,
} from "../../../contexts/purchase-state";

export function ResetButton() {
  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={() => {
        if (purchaseInteractionLockedSignal.value) return;
        shopping.reset();
        resetPurchaseState();
      }}
      type="reset"
      disabled={
        shopping.selected.value.length === 0 ||
        purchaseInteractionLockedSignal.value
      }
      aria-label="Vider le panier"
      title="Vider le panier"
    >
      <RotateCcw class="size-5" />
    </Button>
  );
}

export function SubmitButton() {
  const { route } = useLocation();
  const { data, loading: memberLoading, clear } = useMember();
  const hasPendingPurchase = pendingPurchaseSignal.value !== null;
  const canSubmit = Boolean(
    !purchaseInProgressSignal.value &&
      (hasPendingPurchase ||
        (shopping.total.value > 0 && data && !memberLoading)),
  );

  const handlePurchase = async () => {
    if (purchaseInProgressSignal.value) return;

    let purchaseRequest = pendingPurchaseSignal.value;
    if (!purchaseRequest) {
      if (!data || memberLoading || shopping.total.value <= 0) return;
      purchaseRequest = {
        transactionId: crypto.randomUUID(),
        cardNumber: data.cardNumber,
        items: shopping.selected.value.map((product) => ({
          productId: product.id,
          amount: product.amount,
        })),
      } satisfies PendingPurchase;
      pendingPurchaseSignal.value = purchaseRequest;
    }

    purchaseInProgressSignal.value = true;
    purchaseErrorSignal.value = null;

    try {
      const response = await fetch(apiUrl("purchase"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(purchaseRequest),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload && typeof payload.error === "string"
            ? payload.error
            : `Paiement refusé (erreur ${response.status})`;
        if (response.status >= 400 && response.status < 500) {
          pendingPurchaseSignal.value = null;
          purchaseErrorSignal.value = message;
        } else {
          purchaseErrorSignal.value =
            `${message}. Résultat incertain : utilisez Réessayer.`;
        }
        return;
      }

      const result = purchaseResponseSchema.parse(await response.json());

      if (result.transaction.transactionId !== purchaseRequest.transactionId) {
        throw new Error("Le serveur a répondu avec une autre transaction");
      }

      setTicket({
        type: "purchase",
        transaction: result.transaction,
      });

      pendingPurchaseSignal.value = null;
      shopping.reset();
      clear();
      route(TICKET_ROUTE_URL);
    } catch (error) {
      console.error("Erreur de paiement:", error);
      purchaseErrorSignal.value =
        "Connexion perdue : résultat incertain. Réessayez pour vérifier avec le même numéro de transaction.";
    } finally {
      purchaseInProgressSignal.value = false;
    }
  };

  return (
    <Button
      class="min-h-16 w-full text-xl font-bold shadow-md"
      disabled={!canSubmit}
      variant="default"
      onClick={handlePurchase}
    >
      {purchaseInProgressSignal.value ? (
        <Loader2 class="size-5 animate-spin" />
      ) : (
        `${hasPendingPurchase ? "Réessayer" : "Payer"} ${shopping.total.value.toFixed(2)}€`
      )}
    </Button>
  );
}

export function PurchaseError() {
  if (!purchaseErrorSignal.value) return null;

  return (
    <div class="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle class="size-5 shrink-0" />
      <span>{purchaseErrorSignal.value}</span>
    </div>
  );
}
