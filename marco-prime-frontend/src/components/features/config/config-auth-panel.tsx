import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { apiHeaders, apiUrl, DEPLOYMENT_MODE } from "../../../config/api";
import type { MemberSchema } from "../../../schemas/member.schema";
import { clearAdminSession, setAdminSession } from "../../../utils/admin-session";
import {
  configPasswordConfigured,
  refreshConfigAuthStatus,
} from "../../../utils/config-auth-status";
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
  const [setupToken, setSetupToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = () => {
    fetchStatus()
      .then((next) => {
        setStatus(next);
        configPasswordConfigured.value = next.configured;
      })
      .catch(() => setError("Impossible de lire l’état du mot de passe."));
  };

  useEffect(loadStatus, []);

  // En mode serveur, le tout premier mot de passe doit être prouvé par un
  // accès au serveur (API_TOKEN de .env.server). Sans cela, une carte admin
  // énumérée suffirait à prendre le contrôle avant le vrai administrateur.
  const requiresSetupToken =
    DEPLOYMENT_MODE === "server" && status !== null && !status.configured;

  const save = async () => {
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (requiresSetupToken && setupToken.trim().length === 0) {
      setError("Saisissez le jeton d’installation (API_TOKEN du serveur).");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(apiUrl("config-auth/setup"), {
        method: "POST",
        headers: apiHeaders({
          "Content-Type": "application/json",
          ...(requiresSetupToken
            ? { "X-Setup-Token": setupToken.trim() }
            : {}),
        }),
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
      if (
        typeof body?.adminToken === "string" &&
        body?.expiresAt !== undefined
      ) {
        setAdminSession(
          body.adminToken,
          body.expiresAt,
          member.cardNumber,
          member.firstName,
          member.lastName,
        );
      }
      setPassword("");
      setConfirmation("");
      setSetupToken("");
      setMessage("Mot de passe de configuration enregistré.");
      configPasswordConfigured.value = true;
      await refreshConfigAuthStatus();
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
      clearAdminSession();
      configPasswordConfigured.value = false;
      setMessage("Mot de passe supprimé.");
      await refreshConfigAuthStatus();
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
            Un mot de passe unique confirme les actions sensibles après
            identification d’une carte administrateur. Il reste lié à la carte
            de {member.firstName} {member.lastName}.
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

          {requiresSetupToken && (
            <div class="mt-4 rounded-md border bg-muted/30 p-3">
              <label class="flex flex-col gap-1 text-sm font-medium">
                Jeton d’installation (API_TOKEN)
                <input
                  type="password"
                  class="min-h-11 border bg-input px-3 text-base"
                  autocomplete="off"
                  maxlength={128}
                  value={setupToken}
                  onInput={(event) => {
                    setSetupToken(event.currentTarget.value);
                    setError(null);
                    setMessage(null);
                  }}
                />
              </label>
              <p class="mt-2 text-xs text-muted-foreground">
                Copiez la valeur <code>API_TOKEN</code> de{" "}
                <code>.env.server</code> sur le serveur. Ce jeton sert
                uniquement à définir le premier mot de passe ; il n’est jamais
                envoyé au navigateur en fonctionnement normal.
              </p>
            </div>
          )}

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
              disabled={
                saving ||
                password.length < 8 ||
                (requiresSetupToken && setupToken.trim().length === 0)
              }
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
