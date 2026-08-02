/**
 * Indian-numbering (crore/lakh/thousand) amount-in-words, for invoice
 * printing. English only for now — `lang` is threaded through so a Gujarati
 * version can be added later without touching callers.
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]!} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]!);
    n %= 10;
    if (n > 0) parts.push(ONES[n]!);
  } else if (n > 0) {
    parts.push(ONES[n]!);
  }
  return parts.join(' ');
}

function integerToIndianWords(value: number): string {
  if (value === 0) return 'Zero';

  const crore = Math.floor(value / 1_00_00_000);
  value %= 1_00_00_000;
  const lakh = Math.floor(value / 1_00_000);
  value %= 1_00_000;
  const thousand = Math.floor(value / 1_000);
  value %= 1_000;
  const hundred = value;

  const segments: string[] = [];
  if (crore) segments.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) segments.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) segments.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred) segments.push(threeDigitsToWords(hundred));

  return segments.join(' ');
}

/** e.g. 12345.5 → "Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only" */
export function amountInWordsIndian(amount: number, _lang: 'en' | 'gu' = 'en'): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  let words = `Rupees ${integerToIndianWords(rupees)}`;
  if (paise > 0) words += ` and ${integerToIndianWords(paise)} Paise`;
  return `${words} Only`;
}
