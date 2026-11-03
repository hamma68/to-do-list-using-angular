import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const TITLE_MIN = 3;
export const TITLE_MAX = 100;

/** Fails when the value is only whitespace. */
export const notBlank: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  typeof c.value === 'string' && c.value.length > 0 && c.value.trim().length === 0
    ? { blank: true }
    : null;

/** Min length measured on the trimmed value (so "  ab  " counts as 2 chars). */
export const trimmedMinLength =
  (min: number): ValidatorFn =>
  (c: AbstractControl): ValidationErrors | null => {
    const len = typeof c.value === 'string' ? c.value.trim().length : 0;
    return len > 0 && len < min ? { minTrimmed: { requiredLength: min, actualLength: len } } : null;
  };

export function todayString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Optional date field; when filled it must not be before today. */
export const notInPast: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  c.value && c.value < todayString() ? { pastDate: true } : null;
