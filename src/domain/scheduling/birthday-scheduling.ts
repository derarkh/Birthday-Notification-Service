import { DateTime } from 'luxon';

import { parseDateOnly } from './date-only.js';

interface BirthdayDueAtUtcInput {
  birthday: string;
  timezone: string;
  occurrenceYear: number;
}

function resolveBirthdayForYear(birthday: string, occurrenceYear: number): { month: number; day: number } {
  const parsed = parseDateOnly(birthday);
  if (!parsed) {
    throw new Error('birthday must be a valid YYYY-MM-DD date');
  }

  if (parsed.month === 2 && parsed.day === 29) {
    const isLeapYear = DateTime.utc(occurrenceYear, 1, 1).isInLeapYear;

    if (!isLeapYear) {
      // Explicit exercise default: celebrate Feb 29 birthdays on Feb 28 in non-leap years.
      return { month: 2, day: 28 };
    }
  }

  return {
    month: parsed.month,
    day: parsed.day
  };
}

export function calculateBirthdayDueAtUtc(input: BirthdayDueAtUtcInput): Date {
  const { birthday, timezone, occurrenceYear } = input;
  const resolved = resolveBirthdayForYear(birthday, occurrenceYear);
  const localDueTime = DateTime.fromObject(
    {
      year: occurrenceYear,
      month: resolved.month,
      day: resolved.day,
      hour: 9,
      minute: 0,
      second: 0,
      millisecond: 0
    },
    { zone: timezone }
  );

  if (!localDueTime.isValid) {
    throw new Error(localDueTime.invalidReason ?? 'Invalid timezone or local due date');
  }

  return localDueTime.toUTC().toJSDate();
}
