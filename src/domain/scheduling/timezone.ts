import { IANAZone } from 'luxon';

export function canonicalizeTimezone(value: string): string | null {
  if (!IANAZone.isValidZone(value)) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
}

export function isValidTimezone(value: string): boolean {
  return canonicalizeTimezone(value) !== null;
}
