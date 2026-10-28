import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { apiHeaders, apiUrl } from "../../../config/api";
import { AdminAuthPanel } from "../auth/admin-auth-panel";
import { MemberProvider, useMember } from "../../../contexts/member-context";
import type { OrderSchema } from "../../../schemas/order.schema";
import { Button } from "../../ui/button";

interface RechargeCorrectionFormProps {
  order: OrderSchema;
  onComplete: () => void;
}

export function RechargeCorrectionForm(props: RechargeCorrectionFormProps) {
  return (
    <MemberProvider>
      <RechargeCorrectionEditor {...props} />
    </MemberProvider>
  );
}

function RechargeCorrectionEditor({
  order,
  onComplete,
}: RechargeCorrectionFormProps) {
  const { data: member, pause, resume, clear } = useMember();
  const [method, setMethod] = useState<"card" | "cash">(
    order.paymentMethod ?? "card",
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (member?.admin) pause();
    else resume();
  }, [member?.admin]);

  if (!member?.admin) {
    return (
      <section class="mt-6 border-t pt-5">
        <AdminAuthPanel
          title="Corriger ce rechargement"
          description="Carte, QR admin ou code manuel : choisissez la méthode. Le lecteur de carte reste actif en arrière-plan."
        />
      </section>
    );
  }

  const saveMethod = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(apiUrl("recharge-method"), {
        method: "PUT",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          adminCardNumber: member.cardNumber,
          orderId: order.id,
          paymentMethod: method,
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
      setSuccess("Mode de paiement enregistré dans le fichier local.");
      window.setTimeout(onComplete, 700);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Modification impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelRecharge = async () => {
    if (reason.trim().length < 3) {
      setError("Indiquez une raison d’au moins 3 caractères.");
      return;
    }
    const amount = Number(order.effectivePrice);
    if (
      !window.confirm(
        `Annuler ce rechargement de ${amount.toFixed(2)} € ? Le solde du membre sera débité de ce montant.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(apiUrl("recharge-corrections/apply"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          adminCardNumber: member.cardNumber,
          originalOrderId: order.id,
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
      setSuccess("Rechargement annulé et solde corrigé.");
      window.setTimeout(onComplete, 700);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Annulation impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="mt-6 border-t pt-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-xl font-bold">Corriger ce rechargement</h3>
          <p class="text-sm text-muted-foreground">
            Autorisé par {member.firstName} {member.lastName}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={clear}>
          Changer d’administrateur
        </Button>
      </div>

      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <p class="mb-2 text-sm font-medium">Mode de paiement local</p>
          <div class="flex gap-2">
            <Button
              type="button"
              variant={method === "card" ? "default" : "outline"}
              onClick={() => {
                setMethod("card");
                setError(null);
              }}
            >
              Carte bancaire
            </Button>
            <Button
              type="button"
              variant={method === "cash" ? "default" : "outline"}
              onClick={() => {
                setMethod("cash");
                setError(null);
              }}
            >
              Espèces
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => void saveMethod()}
            >
              {saving ? <Loader2 class="animate-spin" /> : null}
              Enregistrer le mode
            </Button>
          </div>
          <p class="mt-2 text-xs text-muted-foreground">
            Le mode est enregistré dans le fichier local de cette Marco et
            apparaîtra dans l’export des rechargements.
          </p>
        </div>

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
            placeholder="Ex. rechargement saisi sur la mauvaise carte"
          />
        </label>
      </div>

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

      <div class="mt-5 flex flex-wrap gap-3 border-t pt-4">
        <Button
          variant="destructive"
          disabled={saving}
          onClick={() => void cancelRecharge()}
        >
          {saving ? <Loader2 class="animate-spin" /> : <XCircle />}
          Annuler le rechargement
        </Button>
      </div>
    </section>
  );
}
