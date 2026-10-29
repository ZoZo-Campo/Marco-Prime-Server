import { signal } from "@preact/signals";

export interface AdminSessionState {
  token: string;
  cardNumber: number;
  firstName: string;
  lastName: string;
  expiresAt: number;
}

const STORAGE_KEY = "marco.adminSession";

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

function readStoredSession(): AdminSessionState | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminSessionState>;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.cardNumber !== "number" ||
      typeof parsed.firstName !== "string" ||
      typeof parsed.lastName !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      store.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as AdminSessionState;
  } catch {
    store.removeItem(STORAGE_KEY);
    return null;
  }
}

/**
 * Session administrateur du navigateur.
 *
 * `sessionStorage` et non `localStorage` : la session disparaît à la
 * fermeture de l'onglet et n'est jamais partagée entre deux caisses du même
 * poste. Le jeton est signé côté serveur et expire au bout de 30 minutes.
 */
export const adminSession = signal<AdminSessionState | null>(
  readStoredSession(),
);

let expirationTimer: number | undefined;

function scheduleExpiration(session: AdminSessionState) {
  if (typeof window === "undefined") return;
  if (expirationTimer !== undefined) window.clearTimeout(expirationTimer);
  expirationTimer = window.setTimeout(
    () => {
      if (adminSession.value?.token === session.token) {
        clearAdminSession();
      }
    },
    Math.max(0, session.expiresAt - Date.now()),
  );
}

export function setAdminSession(
  token: string,
  expiresAt: string | number,
  cardNumber: number,
  firstName: string,
  lastName: string,
) {
  const expiresAtMs =
    typeof expiresAt === "number" ? expiresAt : Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return;

  const session: AdminSessionState = {
    token,
    cardNumber,
    firstName,
    lastName,
    expiresAt: expiresAtMs,
  };
  adminSession.value = session;
  storage()?.setItem(STORAGE_KEY, JSON.stringify(session));
  scheduleExpiration(session);
}

export function clearAdminSession() {
  adminSession.value = null;
  storage()?.removeItem(STORAGE_KEY);
  if (typeof window !== "undefined" && expirationTimer !== undefined) {
    window.clearTimeout(expirationTimer);
    expirationTimer = undefined;
  }
}

export function hasAdminSession() {
  return adminSession.value !== null;
}

export function hasAdminSessionFor(cardNumber: number) {
  return adminSession.value?.cardNumber === cardNumber;
}

export function adminSessionHeaders(): Record<string, string> {
  const session = adminSession.value;
  if (!session) return {};
  if (session.expiresAt <= Date.now()) {
    clearAdminSession();
    return {};
  }
  return { "X-Admin-Token": session.token };
}

// Programmer l'expiration de la session restaurée au chargement.
if (adminSession.value) scheduleExpiration(adminSession.value);
