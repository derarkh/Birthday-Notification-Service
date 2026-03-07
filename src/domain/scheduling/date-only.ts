import { DateTime } from 'luxon';

export interface DateOnlyParts {
  year: number;
  month: number;
  day: number;
}

export function parseDateOnly(value: string): DateOnlyParts | null {
  const parsed = DateTime.fromFormat(value, 'yyyy-MM-dd', { zone: 'UTC' });
  if (!parsed.isValid) {
    return null;
  }

  return { year: parsed.year, month: parsed.month, day: parsed.day };
}

export function isValidDateOnly(value: string): boolean {
  return parseDateOnly(value) !== null;
}

export function formatDateOnly(parts: DateOnlyParts): string {
  const parsed = DateTime.fromObject(
    { year: parts.year, month: parts.month, day: parts.day },
    { zone: 'UTC' }
  );

  if (!parsed.isValid) {
    throw new Error('DateOnlyParts must represent a valid calendar date');
  }

  return parsed.toFormat('yyyy-MM-dd');
}
