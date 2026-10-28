/**
 * Vérifie si le solde est insuffisant pour un montant donné
 * @param total - Le montant total à payer
 * @param balance - Le solde disponible (string ou number)
 * @returns true si le solde est insuffisant, false sinon
 */
export function hasInsufficientBalance(
  total: number,
  balance: string | number,
): boolean {
  const totalCents = Math.round(total * 100);
  const balanceCents = Math.round(Number(balance) * 100);
  return (
    !Number.isSafeInteger(totalCents) ||
    !Number.isSafeInteger(balanceCents) ||
    totalCents > balanceCents
  );
}
