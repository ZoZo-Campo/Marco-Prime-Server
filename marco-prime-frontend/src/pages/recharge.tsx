import { useLocation } from "preact-iso";
import { useEffect } from "preact/hooks";
import { AlertTriangle, Loader2, CreditCard } from "lucide-preact";
import { MemberProvider, useMember } from "../contexts/member-context";
import { setTicket } from "../contexts/ticket-context";
import { useRfid } from "../hooks/use-rfid";
import { rechargeResponseSchema } from "../schemas/recharge.schema";
import { Keypad } from "../components/features/recharge/keypad";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { TICKET_ROUTE_URL } from "./ticket";
import { apiHeaders, apiUrl } from "../config/api";
import {
  pendingRechargeSignal,
  rechargeAmountSignal,
  rechargeErrorSignal,
  rechargeInProgressSignal,
  rechargeInteractionLockedSignal,
  resetRechargeState,
  waitingForAdminSignal,
  type PendingRecharge,
} from "../contexts/recharge-state";

export const RECHARGE_ROUTE_URL = "/recharge";

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
      processRecharge(Number(adminCardNumber));
      clearAdminRfid();
    }
  }, [adminCardNumber, waitingForAdminSignal.value]);

  const processRecharge = async (adminCard?: number) => {
    if (rechargeInProgressSignal.value) return;

    let rechargeRequest = pendingRechargeSignal.value;
    if (!rechargeRequest) {
      if (!member || !rechargeAmountSignal.value) return;
      const adminCardNumber =
        adminCard ?? (member.admin ? member.cardNumber : undefined);
      if (!member.admin && !adminCardNumber) return;

      rechargeRequest = {
        transactionId: crypto.randomUUID(),
        cardNumber: member.cardNumber,
        amount: Number(rechargeAmountSignal.value),
        ...(adminCardNumber ? { adminCardNumber } : {}),
      } satisfies PendingRecharge;
      pendingRechargeSignal.value = rechargeRequest;
    }

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
            : `Rechargement refusé (erreur ${response.status})`;
        if (response.status >= 400 && response.status < 500) {
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
      waitingForAdminSignal.value = false;
      resume();
      route(TICKET_ROUTE_URL);
      clearMember();
    } catch (error) {
      console.error("Erreur de rechargement:", error);
      rechargeErrorSignal.value = error instanceof Error
        ? `${error.message}. Résultat incertain : utilisez Réessayer.`
        : "Connexion perdue. Résultat incertain : utilisez Réessayer.";
      waitingForAdminSignal.value = false;
      resume();
    } finally {
      rechargeInProgressSignal.value = false;
    }
  };

  const handleRecharge = () => {
    if (pendingRechargeSignal.value) {
      void processRecharge();
      return;
    }
    if (!member || !rechargeAmountSignal.value) return;

    if (member.admin) {
      // Member is admin, no need for separate admin card
      processRecharge();
    } else {
      pause();
      waitingForAdminSignal.value = true;
    }
  };

  const handleCancel = () => {
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
    <div class="grid grid-cols-[1fr_300px] flex-1 min-h-0 overflow-hidden">
      {/* Left side - Keypad */}
      <div class="px-7 py-5 flex flex-col gap-5 items-center justify-center">
        <p class="text-muted-foreground text-sm">Montant à recharger</p>
        <p class="text-6xl font-bold mb-4">
          {amount > 0 ? `${amount.toFixed(2)} €` : "0.00 €"}
        </p>
        <div class="w-72">
          <Keypad
            value={rechargeAmountSignal.value}
            onChange={(v) => (rechargeAmountSignal.value = v)}
            disabled={rechargeInteractionLockedSignal.value}
          />
        </div>
      </div>

      {/* Right side - Aside */}
      <aside class="border-l bg-card px-7 py-5 flex flex-col gap-5">
        <h2 class="text-xl font-semibold">Rechargement</h2>

        {/* Member info */}
        {member ? (
          <Card class="gap-2 py-4 px-4">
            <p class="font-medium">
              {member.firstName} {member.lastName}
            </p>
            <p class="text-sm text-muted-foreground">
              Carte: {member.cardNumber}
            </p>
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
      {waitingForAdminSignal.value && (
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card class="w-96 gap-4 py-6">
            <div class="px-6 text-center">
              <CreditCard class="size-16 mx-auto mb-4 text-primary" />
              <h2 class="text-xl font-bold mb-2">Carte admin requise</h2>
              <p class="text-muted-foreground">
                Veuillez scanner une carte administrateur pour valider le
                rechargement
              </p>
            </div>
            <div class="px-6 py-4 border-t border-b text-center">
              <p class="text-2xl font-bold">{amount.toFixed(2)} €</p>
              <p class="text-sm text-muted-foreground">
                pour {member?.firstName} {member?.lastName}
              </p>
            </div>
            <div class="px-6">
              <Button variant="outline" class="w-full" onClick={handleCancel}>
                Annuler
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
