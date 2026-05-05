const formatter = new Intl.NumberFormat('sv-SE', {
  style: 'currency',
  currency: 'SEK',
  minimumFractionDigits: 2,
})

/** Formats öre (integer) to Swedish SEK string, e.g. 9900 → "99,00 kr" */
export function formatCurrency(ore: number): string {
  return formatter.format(ore / 100)
}

/** Converts SEK decimal to öre integer — use only at input boundary */
export function sekToOre(sek: number): number {
  return Math.round(sek * 100)
}
