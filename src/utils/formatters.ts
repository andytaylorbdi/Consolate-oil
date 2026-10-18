/**
 * @file formatters.ts
 * Explicit business calculation formulas and display formatters.
 * 
 * CORE FORMULAS:
 * 1. Restante = Entrée − Sortie
 * 2. Montant = Litres × Prix/L
 * 3. Valeur restante du carburant = Valeur entrée − Valeur distribuée
 * 4. Argent restant prépayé par l'organisation = Montant prépayé réel − Montant consommé
 * 5. À recevoir = Demandé − Reçu
 */

/**
 * Calculates remaining session fuel:
 * Restante = Entrée − Sortie
 */
export function calculateFuelRemaining(fuelIn: number, fuelOut: number): number {
  return Math.max(0, fuelIn - fuelOut);
}

/**
 * Calculates transaction cost:
 * Montant = Litres × Prix/L
 */
export function calculateDistributionCost(liters: number, pricePerLiter: number): number {
  return Math.max(0, liters * pricePerLiter);
}

/**
 * Calculates organization remaining prepaid money:
 * Argent restant = Prépayé réel − Consommé
 */
export function calculatePrepaidRemaining(actualPrepaid: number, consumed: number): number {
  return actualPrepaid - consumed;
}

/**
 * Calculates remaining fuel allocation:
 * À recevoir = Demandé − Reçu
 */
export function calculateAllocationRemaining(requested: number, received: number): number {
  return Math.max(0, requested - received);
}

/**
 * Formats a number with comma separators (e.g., 10,000)
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(num));
}

/**
 * Formats fuel liters (e.g., "10,000 L")
 */
export function formatLiters(liters: number): string {
  return `${formatNumber(liters)} L`;
}

/**
 * Formats Burundian Francs (FBU) (e.g., "39,500,000 FBU")
 */
export function formatFBU(amount: number): string {
  return `${formatNumber(amount)} FBU`;
}

/**
 * Formats price per liter (e.g., "3,950 FBU / L")
 */
export function formatPricePerLiter(price: number): string {
  return `${formatNumber(price)} FBU / L`;
}

/**
 * Returns today's date in YYYY-MM-DD format (local time)
 */
export function getTodayDateStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats YYYY-MM-DD into "Programme du DD/MM/YYYY"
 */
export function formatProgramTitle(scheduledDateStr: string): string {
  if (!scheduledDateStr) return 'Programme de distribution';
  const parts = scheduledDateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `Programme du ${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  return `Programme du ${scheduledDateStr}`;
}
