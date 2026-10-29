import { useLocation } from "preact-iso";
import { useEffect } from "preact/hooks";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-preact";
import { MemberProvider, useMember } from "../contexts/member-context";
import { setTicket } from "../contexts/ticket-context";
import { useRfid } from "../hooks/use-rfid";
import { rechargeResponseSchema } from "../schemas/recharge.schema";
import { Keypad } from "../components/features/recharge/keypad";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { TICKET_ROUTE_URL } from "./ticket";
import { apiHeaders, apiUrl } from "../config/api";
import { MemberSearch } from "../components/features/member/member-search";
import { QrScanButton } from "../components/features/member/qr-scan-button";
import { BirthdayBadge } from "../components/features/member/birthday-badge";
import { CardCodeEntry } from "../components/features/buy/card-code-entry";
import { AdminPasswordDialog } from "../components/features/auth/admin-password-dialog";
import { adminSessionRequired, hasValidAdminSession } from "../utils/admin-access";
import { clearAdminSession } from "../utils/admin-session";
import {
  adminPasswordCardSignal,
  pendingRechargeSignal,
  rechargeAmountSignal,
  rechargePaymentMethodSignal,
  rechargeErrorSignal,
  rechargeInProgressSignal,
  rechargeInteractionLockedSignal,
  resetRechargeState,
  waitingForAdminSignal,
  type PendingRecharge,
} from "../contexts/recharge-state";

export const RECHARGE_ROUTE_URL = "/recharge";

const RECHARGE_PRESETS = [5, 10, 15, 20, 50, 100] as const;

export function RechargePage() {
  return (
    <MemberProvider disabled={rechargeInteractionLockedSignal.value}>
      <RechargeContent />
    </MemberProvider>
  );
}

function RechargeContent() {
  const { route } = useLocation();
  const {
    data: member,
    error: memberLookupError,
    inputLength,
    retry: retryMember,
    clear: clearMember,
    pause,
    resume,
  } = useMember();

  const { value: adminCardNumber, clear: clearAdminRfid } = useRfid({
    disabled: !waitingForAdminSignal.value,
  });

  useEffect(() => {
    resetRechargeState();
    resume();
  }, []);

  useEffect(() => {
    if (waitingForAdminSignal.value && adminCardNumber && member) {
      beginRecharge(Number(adminCardNumber));
      clearAdminRfid();
    }
  }, [adminCardNumber, waitingForAdminSignal.value]);

  /**
   * Vérifie la session avant d'envoyer l'opération. En mode serveur avec mot
   * de passe, la carte administratrice doit être couverte par une session
   * signée ; sinon on demande le mot de passe sans perdre le panier en cours.
   */
  const beginRecharge = (adminCard?: number) => {
    if (rechargeInProgressSignal.value) return;
    const pending = pendingRechargeSignal.value;
    const authorizingCard =
      adminCard ??
      pending?.adminCardNumber ??
      (member?.admin ? member.cardNumber : undefined);

    if (
      adminSessionRequired() &&
      (authorizingCard === undefined ||
        !hasValidAdminSession(authorizingCard))
    ) {
      if (authorizingCard === undefined) {
        rechargeErrorSignal.value =
          "Carte administrateur requise pour ouvrir la session.";
        return;
      }
      pause();
      adminPasswordCardSignal.value = authorizingCard;
      return;
    }

    void processRecharge(adminCard);
  };

  const processRecharge = async (adminCard?: number) => {
    if (rechargeInProgressSignal.value) return;

    let rechargeRequest = pendingRechargeSignal.value;
    if (!rechargeRequest) {
      if (!member || !rechargeAmountSignal.value) return;
      const authorizingCard =
        adminCard ?? (member.admin ? member.cardNumber : undefined);
      if (!member.admin && !authorizingCard) return;

      rechargeRequest = {
        transactionId: crypto.randomUUID(),
        cardNumber: member.cardNumber,
        amount: Number(rechargeAmountSignal.value),
        paymentMethod: rechargePaymentMethodSignal.value,
        // Pour un membre non-admin, la carte admin est transmise comme avant.
        // Pour un admin qui se recharge lui-même, le serveur utilise sa
        // propre carte et la réponse ne contient pas `processedBy`.
        ...(!member.admin && authorizingCard
          ? { adminCardNumber: authorizingCard }
          : {}),
      } satisfies PendingRecharge;
      pendingRechargeSignal.value = rechargeRequest;
    }

    adminPasswordCardSignal.value = null;
    waitingForAdminSignal.value = false;
    resume();
    rechargeInProgressSignal.value = true;
    rechargeErrorSignal.value = null;

    try {
      const response = await fetch(apiUrl("recharge"), {
        method: "POST",
        headers: apiHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(rechargeRequest),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload && typeof payload.error === "string"
            ? payload.error
            : payload && typeof payload.message === "string"
              ? payload.message
              : `Rechargement refusé (erreur ${response.status})`;
        if (response.status === 401) {
          // Session absente ou expirée : on garde la transaction en attente
          // pour la rejouer avec le même identifiant après déverrouillage.
          clearAdminSession();
          rechargeErrorSignal.value = message;
        } else if (response.status >= 400 && response.status < 500) {
          pendingRechargeSignal.value = null;
          rechargeErrorSignal.value = message;
        } else {
          rechargeErrorSignal.value =
            `${message}. Résultat incertain : utilisez Réessayer.`;
        }
        return;
      }

      const result = rechargeResponseSchema.parse(await response.json());
      if (
        result.transaction.transactionId !== rechargeRequest.transactionId
      ) {
        throw new Error("Le serveur a répondu avec une autre transaction");
      }

      setTicket({
        type: "recharge",
        transaction: result.transaction,
      });

      rechargeAmountSignal.value = "";
      pendingRechargeSignal.value = null;
      adminPasswordCardSignal.value = null;
      waitingForAdminSignal.value = false;
      resume();
      route(TICKET_ROUTE_URL);
      clearMember();
    } catch (error) {
      console.error("Erreur de rechargement:", error);
      rechargeErrorSignal.value = error instanceof Error
        ? `${error.message}. Résultat incertain : utilisez Réessayer.`
        : "Connexion perdue. Résultat incertain : utilisez Réessayer.";
      adminPasswordCardSignal.value = null;
      waitingForAdminSignal.value = false;
      resume();
    } finally {
      rechargeInProgressSignal.value = false;
    }
  };

  const handleRecharge = () => {
    if (pendingRechargeSignal.value) {
      beginRecharge();
      return;
    }
    if (!member || !rechargeAmountSignal.value) return;

    if (member.admin) {
      // Le membre est administrateur : sa propre carte autorise l'opération.
      beginRecharge(member.cardNumber);
    } else {
      pause();
      waitingForAdminSignal.value = true;
    }
  };

  const handleCancel = () => {
    adminPasswordCardSignal.value = null;
    waitingForAdminSignal.value = false;
    resume();
  };

  const amount = pendingRechargeSignal.value?.amount ?? (
    rechargeAmountSignal.value ? Number(rechargeAmountSignal.value) : 0
  );
  const currentBalance = member ? Number(member.balance) : 0;
  const newBalance = currentBalance + amount;
  const canRecharge = Boolean(
    !rechargeInProgressSignal.value &&
      (pendingRechargeSignal.value || (member && amount > 0)),
  );

  return (
    <div class="flex flex-1 min-h-0 flex-col overflow-y-auto lg:grid lg:grid-cols-[1fr_300px] lg:overflow-hidden">
      {/* Left side - Keypad */}
      <div class="flex flex-col items-center justify-center gap-5 px-4 py-5 sm:px-7">
        <p class="text-muted-foreground text-sm">Montant à recharger</p>
        <p class="text-6xl font-bold mb-4">
          {amount > 0 ? `${amount.toFixed(2)} €` : "0.00 €"}
        </p>
        <div class="grid w-full max-w-xs grid-cols-3 gap-2">
          {RECHARGE_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant={
                rechargeAmountSignal.value === String(preset)
                  ? "default"
                  : "outline"
              }
              class="h-11 text-base font-semibold"
              onClick={() => (rechargeAmountSignal.value = String(preset))}
              disabled={rechargeInteractionLockedSignal.value}
            >
              {preset} €
            </Button>
          ))}
        </div>
        <div class="w-full max-w-xs">
          <Keypad
            value={rechargeAmountSignal.value}
            onChange={(v) => (rechargeAmountSignal.value = v)}
            disabled={rechargeInteractionLockedSignal.value}
          />
        </div>
      </div>

      {/* Right side - Aside */}
      <aside class="flex flex-col gap-5 border-t bg-card px-4 py-5 sm:px-7 lg:border-l lg:border-t-0">
        <h2 class="text-xl font-semibold">Rechargement</h2>
        <fieldset disabled={rechargeInteractionLockedSignal.value} class="space-y-2">
          <legend class="text-sm font-medium">Paiement reçu</legend>
          <div class="grid grid-cols-2 gap-2">
            <Button type="button" variant={rechargePaymentMethodSignal.value === "card" ? "default" : "outline"} onClick={() => rechargePaymentMethodSignal.value = "card"}>CB</Button>
            <Button type="button" variant={rechargePaymentMethodSignal.value === "cash" ? "default" : "outline"} onClick={() => rechargePaymentMethodSignal.value = "cash"}>Espèces</Button>
          </div>
        </fieldset>

        {/* Member info */}
        {member ? (
          <Card class="gap-2 py-4 px-4">
            <p class="font-medium">
              {member.firstName} {member.lastName}
            </p>
            <p class="text-sm text-muted-foreground">
              Carte: {member.cardNumber}
            </p>
            {member.isBirthday && <BirthdayBadge firstName={member.firstName} />}
          </Card>
        ) : (
          <Card class="gap-2 py-4 px-4">
            {memberLookupError ? (
              <>
                <p class="text-destructive text-center">
                  Carte inconnue ou serveur indisponible
                </p>
                <div class="flex gap-2">
                  <Button
                    variant="outline"
                    class="flex-1"
                    onClick={() => void retryMember()}
                  >
                    Réessayer
                  </Button>
                  <Button class="flex-1" onClick={clearMember}>
                    Autre carte
                  </Button>
                </div>
              </>
            ) : (
              <p class="text-muted-foreground text-center">
                {inputLength > 0
                  ? `Saisie en cours : ${inputLength} chiffre${inputLength > 1 ? "s" : ""}. Appuyez sur Entrée.`
                  : "Scannez une carte, ou saisissez son numéro puis appuyez sur Entrée."}
              </p>
            )}
            <MemberSearch />
          </Card>
        )}

        {/* Transaction summary */}
        <div class="flex-1 flex flex-col gap-3">
          {member && amount > 0 && (
            <>
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">Solde actuel</span>
                <span>{currentBalance.toFixed(2)} €</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">Rechargement</span>
                <span class="text-green-600">+{amount.toFixed(2)} €</span>
              </div>
              <div class="border-t pt-3 flex justify-between font-semibold">
                <span>Nouveau solde</span>
                <span class="text-green-600">{newBalance.toFixed(2)} €</span>
              </div>
            </>
          )}
        </div>

        {rechargeErrorSignal.value && (
          <div class="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle class="size-5 shrink-0" />
            <span>{rechargeErrorSignal.value}</span>
          </div>
        )}

        {/* Recharge button */}
        <Button class="h-12" disabled={!canRecharge} onClick={handleRecharge}>
          {rechargeInProgressSignal.value ? (
            <Loader2 class="size-5 animate-spin" />
          ) : (
            `${pendingRechargeSignal.value ? "Réessayer" : "Recharger"} ${amount.toFixed(2)} €`
          )}
        </Button>
      </aside>

      {/* Admin card modal */}
      {waitingForAdminSignal.value && adminPasswordCardSignal.value === null && (
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card class="w-96 gap-4 py-6">
            <div class="px-6 text-center">
              <ShieldCheck class="size-12 mx-auto mb-3 text-primary" />
              <h2 class="text-xl font-bold mb-2">Autorisation administrateur</h2>
              <p class="text-muted-foreground">
                La carte RFID reste active en arrière-plan. Vous pouvez aussi
                scanner le QR admin ou saisir son code.
              </p>
            </div>
            <div class="px-6 py-4 border-t border-b text-center">
              <p class="text-2xl font-bold">{amount.toFixed(2)} €</p>
              <p class="text-sm text-muted-foreground">
                pour {member?.firstName} {member?.lastName}
              </p>
            </div>
            <div class="px-6">
              <QrScanButton
                label="Scanner le QR admin"
                onSubmit={(adminCode) => {
                  beginRecharge(Number(adminCode));
                  return false;
                }}
              />
              <p class="mb-3 mt-4 text-sm text-muted-foreground">
                Ou saisissez le code de la carte admin sur le pavé :
              </p>
              <CardCodeEntry
                title="Code admin"
                onSubmit={(adminCode) => {
                  beginRecharge(Number(adminCode));
                  return false;
                }}
              />
            </div>
            <div class="px-6 mt-3">
              <Button variant="outline" class="w-full" onClick={handleCancel}>
                Annuler
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Mot de passe de configuration pour la carte admin déjà scannée */}
      {adminPasswordCardSignal.value !== null && (
        <AdminPasswordDialog
          cardNumber={adminPasswordCardSignal.value}
          title="Confirmer le rechargement"
          description={`Rechargement de ${amount.toFixed(2)} € pour ${member?.firstName ?? "ce membre"} ${member?.lastName ?? ""}. Saisissez le mot de passe de configuration pour autoriser l’opération.`}
          onCancel={handleCancel}
          onUnlocked={() => {
            const card = adminPasswordCardSignal.value;
            if (card !== null) void processRecharge(card);
          }}
        />
      )}
    </div>
  );
}
