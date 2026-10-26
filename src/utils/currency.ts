/**
 * Currency utilities for Bangladeshi Taka (BDT) and integer paisa.
 * 100 paisa = 1 BDT.
 * Formats numbers using the South Asian / Bangladeshi numbering grouping (e.g. 1,50,000).
 */

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBnDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[parseInt(d, 10)]);
}

/**
 * Groups an integer string with South Asian commas:
 * e.g. '12345678' -> '1,23,45,678'
 */
export function formatSouthAsianNumber(val: number | string): string {
  const numStr = String(Math.abs(Math.floor(Number(val))));
  if (numStr.length <= 3) return numStr;

  const lastThree = numStr.substring(numStr.length - 3);
  const remaining = numStr.substring(0, numStr.length - 3);

  const grouped = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${grouped},${lastThree}`;
}

/**
 * Formats integer paisa into Bangladeshi Taka string (e.g. ৳ 1,50,000 or ৳ ১,৫০,০০০).
 */
export function formatBdt(
  paisa: number,
  options?: {
    lang?: string;
    showSymbol?: boolean;
    alwaysDecimals?: boolean;
  }
): string {
  const isNegative = paisa < 0;
  const absPaisa = Math.abs(Math.round(paisa));
  const taka = Math.floor(absPaisa / 100);
  const remPaisa = absPaisa % 100;

  const takaFormatted = formatSouthAsianNumber(taka);

  let formatted = takaFormatted;
  if (options?.alwaysDecimals || remPaisa > 0) {
    formatted = `${takaFormatted}.${String(remPaisa).padStart(2, '0')}`;
  }

  const lang = options?.lang || 'en';
  if (lang === 'bn') {
    formatted = toBnDigits(formatted);
  }

  const prefix = options?.showSymbol === false ? '' : '৳ ';
  const sign = isNegative ? '-' : '';

  return `${sign}${prefix}${formatted}`;
}

/**
 * Converts taka input (e.g. 1500 or "1500.50") into integer paisa.
 */
export function takaToPaisa(taka: number | string): number {
  if (typeof taka === 'string') {
    // Replace bengali numerals if user typed in bengali
    const normalized = taka
      .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
      .replace(/,/g, '')
      .trim();
    const parsed = parseFloat(normalized);
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 100);
  }
  return Math.round(taka * 100);
}

/**
 * Converts integer paisa to decimal taka (e.g. 150000 -> 1500).
 */
export function paisaToTaka(paisa: number): number {
  return Math.round(paisa) / 100;
}
