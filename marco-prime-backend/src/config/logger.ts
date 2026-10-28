// Toute la sortie passe par stdout (redirigee vers server.log par le script de lancement).
// Garder une seule sortie evite des ecritures en double sur la carte SD.
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
    | "recharge.cancelled"
    | "recharge.method_updated"
    | "config.unlocked_with_password"
    | "config.password_set"
    | "config.password_removed"
    | "accounting.updated"
    | "member.created"
    | "member.badge.changed"
    | "product.created"
    | "product.availability.changed"
    | "product.price.changed"
    | "system.env.imported",
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
