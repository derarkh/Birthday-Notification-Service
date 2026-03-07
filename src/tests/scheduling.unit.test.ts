import { describe, expect, it } from 'vitest';

import { calculateBirthdayDueAtUtc } from '../domain/scheduling/birthday-scheduling.js';
import { formatDateOnly, isValidDateOnly, parseDateOnly } from '../domain/scheduling/date-only.js';
import { canonicalizeTimezone, isValidTimezone } from '../domain/scheduling/timezone.js';

describe('date-only validation', () => {
  it('accepts valid YYYY-MM-DD values', () => {
    expect(isValidDateOnly('1985-12-15')).toBe(true);
    expect(parseDateOnly('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it('rejects malformed or impossible dates', () => {
    expect(isValidDateOnly('1985/12/15')).toBe(false);
    expect(isValidDateOnly('1985-02-30')).toBe(false);
  });

  it('formats valid date-only parts and rejects invalid parts', () => {
    expect(formatDateOnly({ year: 2026, month: 3, day: 7 })).toBe('2026-03-07');
    expect(() => formatDateOnly({ year: 2026, month: 2, day: 30 })).toThrow(
      'DateOnlyParts must represent a valid calendar date'
    );
  });
});

describe('timezone validation', () => {
  it('canonicalizes valid IANA timezone values', () => {
    expect(canonicalizeTimezone('Australia/Melbourne')).toBe('Australia/Melbourne');
    expect(canonicalizeTimezone('US/Eastern')).toBe('America/New_York');
  });

  it('rejects invalid timezone values', () => {
    expect(isValidTimezone('Mars/Phobos')).toBe(false);
    expect(canonicalizeTimezone('Mars/Phobos')).toBeNull();
  });
});

describe('birthday due-time calculation', () => {
  it('calculates local 9:00 AM due time for Melbourne and New York', () => {
    const melbourne = calculateBirthdayDueAtUtc({
      birthday: '1985-12-15',
      timezone: 'Australia/Melbourne',
      occurrenceYear: 2026
    });

    const newYork = calculateBirthdayDueAtUtc({
      birthday: '1985-12-15',
      timezone: 'America/New_York',
      occurrenceYear: 2026
    });

    expect(melbourne.toISOString()).toBe('2026-12-14T22:00:00.000Z');
    expect(newYork.toISOString()).toBe('2026-12-15T14:00:00.000Z');
  });

  it('handles DST-sensitive dates in New York', () => {
    const springForwardDay = calculateBirthdayDueAtUtc({
      birthday: '1985-03-08',
      timezone: 'America/New_York',
      occurrenceYear: 2026
    });

    const fallBackDay = calculateBirthdayDueAtUtc({
      birthday: '1985-11-01',
      timezone: 'America/New_York',
      occurrenceYear: 2026
    });

    expect(springForwardDay.toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(fallBackDay.toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('uses explicit Feb 29 fallback to Feb 28 in non-leap occurrence years', () => {
    const dueAtUtc = calculateBirthdayDueAtUtc({
      birthday: '2000-02-29',
      timezone: 'Australia/Melbourne',
      occurrenceYear: 2025
    });

    expect(dueAtUtc.toISOString()).toBe('2025-02-27T22:00:00.000Z');
  });
});
