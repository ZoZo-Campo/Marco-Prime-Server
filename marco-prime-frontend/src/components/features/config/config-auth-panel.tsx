import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { apiHeaders, apiUrl } from "../../../config/api";
import type { MemberSchema } from "../../../schemas/member.schema";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

type AuthStatus = { configured: boolean; updatedAt: string | null };

async function fetchStatus(): Promise<AuthStatus> {
  const response = await fetch(apiUrl("config-auth/status"), {
    cache: "no-store",
    headers: apiHeaders(),
  });
  if (!response.ok) throw new Error("Statut du mot de passe indisponible.");
  return (await response.json()) as AuthStatus;
}

export function ConfigPasswordSettings({
  member,
}: {
  member: MemberSchema;
}) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = () => {
    fetchStatus()
      .then(setStatus)
      .catch(() => setError("Impossible de lire l’état du mot de passe."));
  };

  useEffect(loadStatus, []);

  const save = async () => {
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(apiUrl("config-auth/setup"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          adminCardNumber: member.cardNumber,
          password,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.message ?? body?.error ?? `Erreur HTTP ${response.status}`,
        );
      }
      setPassword("");
      setConfirmation("");
      setMessage("Mot de passe de configuration enregistré.");
      loadStatus();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Enregistrement impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  const disable = async () => {
    if (
      !window.confirm(
        "Supprimer le mot de passe de configuration ? L’accès se fera uniquement par carte administrateur.",
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(apiUrl("config-auth/disable"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adminCardNumber: member.cardNumber }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.message ?? body?.error ?? `Erreur HTTP ${response.status}`,
        );
      }
      setMessage("Mot de passe supprimé.");
      loadStatus();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Suppression impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card class="p-6">
      <div class="flex items-start gap-4">
        <span class="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <ShieldCheck class="size-8" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-xl font-bold">Mot de passe de configuration</h2>
          <p class="mt-1 text-muted-foreground">
            Un mot de passe unique permet d’ouvrir la configuration sans
            scanner la carte administrateur. Il reste lié à la carte de{" "}
            {member.firstName} {member.lastName}.
          </p>
          <p class="mt-2 text-sm">
            État :{" "}
            {status === null ? (
              "chargement…"
            ) : status.configured ? (
              <span class="text-green-500">défini</span>
            ) : (
              <span class="text-muted-foreground">non défini</span>
            )}
          </p>

          <div class="mt-4 grid gap-2 sm:grid-cols-2">
            <label class="flex flex-col gap-1 text-sm font-medium">
              {status?.configured ? "Nouveau mot de passe" : "Mot de passe"}
              <input
                type="password"
                class="min-h-11 border bg-input px-3 text-base"
                autocomplete="new-password"
                maxlength={128}
                value={password}
                onInput={(event) => {
                  setPassword(event.currentTarget.value);
                  setError(null);
                  setMessage(null);
                }}
              />
            </label>
            <label class="flex flex-col gap-1 text-sm font-medium">
              Confirmation
              <input
                type="password"
                class="min-h-11 border bg-input px-3 text-base"
                autocomplete="new-password"
                maxlength={128}
                value={confirmation}
                onInput={(event) => {
                  setConfirmation(event.currentTarget.value);
                  setError(null);
                  setMessage(null);
                }}
              />
            </label>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={saving || password.length < 8}
              onClick={() => void save()}
            >
              {saving ? <Loader2 class="animate-spin" /> : <KeyRound />}
              {status?.configured ? "Modifier le mot de passe" : "Définir le mot de passe"}
            </Button>
            {status?.configured && (
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={() => void disable()}
              >
                <Trash2 /> Supprimer
              </Button>
            )}
          </div>
          {error && (
            <p class="mt-3 flex gap-2 text-destructive">
              <AlertTriangle class="size-5 shrink-0" /> {error}
            </p>
          )}
          {message && (
            <p class="mt-3 flex gap-2 text-green-500">
              <CheckCircle2 class="size-5 shrink-0" /> {message}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
