// Docker collecte déjà stdout et applique la rotation configurée dans Compose.
// Garder une seule sortie évite des écritures en double sur la carte SD.
export function customLogger(message: string, ...rest: string[]) {
  if (process.env.NODE_ENV === "test") return;
  const sanitizedMessage = message.replace(
    /(\/api\/v1\/member\/)(\d+)/g,
    "$1[carte-masquee]",
  );
  const sanitizedRest = rest.map((value) =>
    value.replace(/(\/api\/v1\/member\/)(\d+)/g, "$1[carte-masquee]"),
  );
  console.log(sanitizedMessage, ...sanitizedRest);
}

export function auditEvent(
  event:
    | "purchase.completed"
    | "recharge.completed"
    | "purchase.corrected"
    | "accounting.updated",
  details: Record<string, unknown>,
) {
  if (process.env.NODE_ENV === "test") return;
  try {
    console.log(
      JSON.stringify({
        level: "audit",
        event,
        occurredAt: new Date().toISOString(),
        ...details,
      }),
    );
  } catch {
    // A logging failure must never turn a committed payment into a retry.
  }
}
