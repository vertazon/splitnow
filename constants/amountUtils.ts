/**
 * Sanitises raw text from a monetary TextInput.
 * Allowed characters: digits + one decimal point + max 2 decimal digits.
 * Intermediate states like "120." are preserved so the user can continue typing.
 * Negatives and non-numeric characters are silently dropped.
 */
export function sanitizeAmountInput(raw: string): string {
  // Drop everything except digits and dots
  let s = raw.replace(/[^0-9.]/g, '');

  // Collapse multiple dots — keep only the first occurrence
  const dotIdx = s.indexOf('.');
  if (dotIdx !== -1) {
    s = s.slice(0, dotIdx + 1) + s.slice(dotIdx + 1).replace(/\./g, '');
    // Truncate to max 2 decimal digits (block the 3rd digit at keystroke level)
    if (s.length > dotIdx + 3) {
      s = s.slice(0, dotIdx + 3);
    }
  }

  return s;
}

/**
 * Returns true only when the string is a complete, valid, positive monetary value.
 * "120." with a trailing dot is treated as incomplete → false.
 */
export function isValidAmount(s: string): boolean {
  if (!s || s === '.' || s.endsWith('.')) return false;
  const n = parseFloat(s);
  return !isNaN(n) && isFinite(n) && n > 0;
}

/**
 * Parses a validated amount string to a number clamped to 2 decimal places.
 * Returns 0 for any invalid input.
 */
export function parseAmount(s: string): number {
  if (!isValidAmount(s)) return 0;
  // parseFloat then toFixed(2) eliminates any floating-point drift
  return parseFloat(parseFloat(s).toFixed(2));
}

/**
 * Formats a non-negative number for display:
 *   - Whole numbers  → no decimal suffix  (120   → "₹120")
 *   - Fractional     → exactly 2 places   (120.5 → "₹120.50")
 *
 * Uses en-IN grouping throughout (1,23,456).
 */
export function formatAmount(n: number, prefix = '₹'): string {
  const abs = Math.abs(n);
  if (Number.isInteger(abs)) {
    return prefix + abs.toLocaleString('en-IN');
  }
  return prefix + abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Same as formatAmount but with a +/− sign prefix.
 */
export function formatSigned(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  return sign + formatAmount(Math.abs(n));
}
