import {
  AlertTriangle,
  CreditCard,
  Keyboard,
  KeyRound,
  Loader2,
  QrCode,
  ShieldAlert,
  ShieldCheck,
} from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { useMember } from "../../../contexts/member-context";
import { clearAdminSession } from "../../../utils/admin-session";
import { isAdminAccessGranted } from "../../../utils/admin-access";
import { unlockAdminSession } from "../../../utils/admin-unlock";
import {
  configPasswordConfigured,
  refreshConfigAuthStatus,
} from "../../../utils/config-auth-status";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { CardCodeEntry } from "../buy/card-code-entry";
import { QrScanButton } from "../member/qr-scan-button";

type AuthMethod = "card" | "qr" | "code" | "password";

const METHOD_LABELS: Record<AuthMethod, string> = {
  card: "Carte",
  qr: "QR admin",
  code: "Code",
  password: "Mot de passe",
};

interface AdminAuthPanelProps {
  title?: string;
  description?: string;
  allowPassword?: boolean;
}

export function AdminAuthPanel({
  title = "Autorisation administrateur",
  description,
  allowPassword = false,
}: AdminAuthPanelProps) {
  const {
    data: member,
    loading,
    error,
    inputLength,
    retry,
    submitCardNumber,
    clear,
    pause,
    resume,
    select,
  } = useMember();
  const [method, setMethod] = useState<AuthMethod>("card");
  const [password, setPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (configPasswordConfigured.value === null) {
      void refreshConfigAuthStatus();
    }
  }, []);

  const passwordConfigured = configPasswordConfigured.value === true;
  // Une carte admin identifiée ne suffit plus en mode serveur : si un mot de
  // passe existe, il faut ouvrir une session signée pour cette carte avant de
  // toucher aux données. En local/tablette, le parcours carte reste inchangé.
  const needsConfirmation =
    member?.admin === true && !isAdminAccessGranted(member.cardNumber);

  if (member?.admin && !needsConfirmation) return null;

  const chooseMethod = (next: AuthMethod) => {
    setMethod(next);
    setPasswordError(null);
    if (next !== "card") resume();
  };

  const unlockWithPassword = async (cardNumber?: number) => {
    if (password.length < 8) {
      setPasswordError("Saisissez le mot de passe de configuration.");
      return;
    }
    setPasswordLoading(true);
    setPasswordError(null);
    try {
      const unlocked = await unlockAdminSession(password, cardNumber);
      setPassword("");
      select(unlocked);
    } catch (cause) {
      setPasswordError(
        cause instanceof Error ? cause.message : "Déverrouillage impossible.",
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  const methods: AuthMethod[] = allowPassword && passwordConfigured
    ? ["card", "qr", "code", "password"]
    : ["card", "qr", "code"];

  if (needsConfirmation && member) {
    return (
      <Card class="gap-4 p-5">
        <div class="flex items-start gap-3">
          <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck class="size-6" />
          </span>
          <div class="min-w-0">
            <h2 class="text-xl font-bold">Confirmer la session</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              Carte reconnue : {member.firstName} {member.lastName}. Saisissez
              le mot de passe de configuration pour autoriser les actions
              sensibles.
            </p>
          </div>
        </div>
        <form
          class="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void unlockWithPassword(member.cardNumber);
          }}
        >
          <label class="text-sm font-medium" for="admin-confirm-password">
            Mot de passe de configuration
          </label>
          <div class="flex flex-wrap gap-2">
            <input
              id="admin-confirm-password"
              type="password"
              autocomplete="current-password"
              maxlength={128}
              class="min-h-11 min-w-0 flex-1 border bg-input px-3 text-lg"
              value={password}
              placeholder="Mot de passe"
              onInput={(event) => {
                setPassword(event.currentTarget.value);
                setPasswordError(null);
              }}
            />
            <Button
              type="submit"
              disabled={passwordLoading || password.length < 8}
            >
              {passwordLoading ? <Loader2 class="size-4 animate-spin" /> : null}
              Autoriser
            </Button>
          </div>
          {passwordError && (
            <p class="flex gap-2 text-sm text-destructive">
              <AlertTriangle class="size-4 shrink-0" /> {passwordError}
            </p>
          )}
        </form>
        <Button
          variant="outline"
          onClick={() => {
            clearAdminSession();
            setPassword("");
            setPasswordError(null);
            clear();
          }}
        >
          Changer de carte
        </Button>
      </Card>
    );
  }

  return (
    <Card class="gap-4 p-5">
      <div class="flex items-start gap-3">
        <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <ShieldCheck class="size-6" />
        </span>
        <div class="min-w-0">
          <h2 class="text-xl font-bold">{title}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {description ??
              "Choisissez une méthode. Le lecteur de carte reste actif en arrière-plan."}
          </p>
        </div>
      </div>

      {member && !member.admin && (
        <div class="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <ShieldAlert class="size-5 shrink-0 text-destructive" />
          <span class="min-w-0 flex-1">
            La carte de {member.firstName} {member.lastName} n’est pas
            administratrice.
          </span>
          <Button size="sm" variant="outline" onClick={clear}>
            Changer
          </Button>
        </div>
      )}

      <div class="flex flex-wrap gap-2" role="tablist" aria-label="Méthode d’autorisation">
        {methods.map((item) => {
          const Icon =
            item === "card"
              ? CreditCard
              : item === "qr"
                ? QrCode
                : item === "code"
                  ? Keyboard
                  : KeyRound;
          return (
            <Button
              key={item}
              type="button"
              variant={method === item ? "default" : "outline"}
              size="sm"
              role="tab"
              aria-selected={method === item}
              onClick={() => chooseMethod(item)}
            >
              <Icon class="size-4" />
              {METHOD_LABELS[item]}
            </Button>
          );
        })}
      </div>

      {method === "card" && (
        <div class="rounded-md border bg-muted/30 p-3 text-sm">
          {loading ? (
            <span class="flex items-center gap-2">
              <Loader2 class="size-4 animate-spin" /> Lecture de la carte…
            </span>
          ) : error ? (
            <div class="flex flex-wrap items-center gap-2">
              <AlertTriangle class="size-4 text-destructive" />
              <span class="text-destructive">Carte inconnue ou serveur indisponible.</span>
              <Button size="sm" variant="outline" onClick={() => void retry()}>
                Réessayer
              </Button>
            </div>
          ) : inputLength > 0 ? (
            <span>
              Carte en cours de lecture : {inputLength} chiffre
              {inputLength > 1 ? "s" : ""}.
            </span>
          ) : (
            <span class="text-muted-foreground">
              Scannez votre carte RFID. Elle reste active même si vous choisissez
              une autre méthode.
            </span>
          )}
        </div>
      )}

      {method === "qr" && (
        <div>
          <QrScanButton
            class="mt-0"
            label="Scanner le QR admin"
            autoStart
            onSubmit={(cardNumber) => {
              submitCardNumber(cardNumber);
              setMethod("card");
              return false;
            }}
            onScanStart={pause}
            onScanEnd={resume}
          />
          <p class="mt-2 text-xs text-muted-foreground">
            Présentez le QR code administrateur devant la caméra.
          </p>
        </div>
      )}

      {method === "code" && (
        <div>
          <p class="mb-3 text-sm text-muted-foreground">
            Saisissez le code de la carte administrateur sur le pavé ci-dessous.
          </p>
          <CardCodeEntry
            title="Code carte admin"
            onSubmit={(cardNumber) => {
              submitCardNumber(cardNumber);
              setMethod("card");
              return false;
            }}
          />
        </div>
      )}

      {method === "password" && (
        <form
          class="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void unlockWithPassword();
          }}
        >
          <label class="text-sm font-medium" for="admin-auth-password">
            Mot de passe de configuration
          </label>
          <div class="flex flex-wrap gap-2">
            <input
              id="admin-auth-password"
              type="password"
              autocomplete="current-password"
              maxlength={128}
              class="min-h-11 min-w-0 flex-1 border bg-input px-3 text-lg"
              value={password}
              placeholder="Mot de passe"
              onInput={(event) => {
                setPassword(event.currentTarget.value);
                setPasswordError(null);
              }}
            />
            <Button
              type="submit"
              disabled={passwordLoading || password.length < 8}
            >
              {passwordLoading ? <Loader2 class="size-4 animate-spin" /> : null}
              Déverrouiller
            </Button>
          </div>
          {passwordError && (
            <p class="flex gap-2 text-sm text-destructive">
              <AlertTriangle class="size-4 shrink-0" /> {passwordError}
            </p>
          )}
        </form>
      )}
    </Card>
  );
}
