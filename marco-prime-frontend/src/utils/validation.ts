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
  return total > Number(balance);
}
