import { AlertTriangle, KeyRound, Loader2 } from "lucide-preact";
import { useState } from "preact/hooks";
import { unlockAdminSession } from "../../../utils/admin-unlock";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

interface AdminPasswordDialogProps {
  cardNumber: number;
  title?: string;
  description?: string;
  onUnlocked: () => void;
  onCancel: () => void;
}

/**
 * Demande le mot de passe de configuration pour une carte administrateur déjà
 * identifiée. Utilisé par le rechargement, où la carte est scannée par le
 * lecteur RFID avant l'ouverture de la session.
 */
export function AdminPasswordDialog({
  cardNumber,
  title = "Confirmer l’autorisation",
  description = "Saisissez le mot de passe de configuration pour autoriser cette action.",
  onUnlocked,
  onCancel,
}: AdminPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password.length < 8) {
      setError("Saisissez le mot de passe de configuration.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await unlockAdminSession(password, cardNumber);
      setPassword("");
      onUnlocked();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Déverrouillage impossible.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card class="w-full max-w-md gap-4 py-6">
        <div class="px-6 text-center">
          <span class="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <KeyRound class="size-7" />
          </span>
          <h2 class="text-xl font-bold">{title}</h2>
          <p class="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
        <form
          class="flex flex-col gap-3 px-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label class="text-sm font-medium" for="admin-password-dialog">
            Mot de passe de configuration
          </label>
          <input
            id="admin-password-dialog"
            type="password"
            autocomplete="current-password"
            maxlength={128}
            class="min-h-11 border bg-input px-3 text-lg"
            value={password}
            placeholder="Mot de passe"
            onInput={(event) => {
              setPassword(event.currentTarget.value);
              setError(null);
            }}
          />
          {error && (
            <p class="flex gap-2 text-sm text-destructive">
              <AlertTriangle class="size-4 shrink-0" /> {error}
            </p>
          )}
          <div class="flex flex-wrap gap-2">
            <Button
              type="submit"
              class="flex-1"
              disabled={loading || password.length < 8}
            >
              {loading ? <Loader2 class="size-4 animate-spin" /> : null}
              Autoriser
            </Button>
            <Button
              type="button"
              variant="outline"
              class="flex-1"
              disabled={loading}
              onClick={onCancel}
            >
              Annuler
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
