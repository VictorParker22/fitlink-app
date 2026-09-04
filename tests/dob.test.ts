import { formatDobInput, parseDob, MIN_AGE } from '../lib/dob';

describe('formatDobInput', () => {
  it('inserts dashes as digits arrive', () => {
    expect(formatDobInput('1')).toBe('1');
    expect(formatDobInput('1990')).toBe('1990');
    expect(formatDobInput('199001')).toBe('1990-01');
    expect(formatDobInput('19900115')).toBe('1990-01-15');
  });

  it('strips non-digit characters', () => {
    expect(formatDobInput('1990-01-15')).toBe('1990-01-15');
    expect(formatDobInput('abc1990def01ghi15')).toBe('1990-01-15');
  });

  it('caps input at 8 digits', () => {
    expect(formatDobInput('199001159999')).toBe('1990-01-15');
  });
});

describe('parseDob', () => {
  it('accepts a valid, clearly-adult date', () => {
    const result = parseDob('1990-01-15');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.iso).toBe('1990-01-15');
  });

  it('rejects a malformed string', () => {
    const result = parseDob('01/15/1990');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/YYYY-MM-DD/);
  });

  it('rejects a date that does not exist', () => {
    const result = parseDob('1990-02-30');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/does not look right/);
  });

  it('rejects a birth year before 1900', () => {
    const result = parseDob('1899-01-01');
    expect(result.ok).toBe(false);
  });

  it('rejects someone under the minimum age', () => {
    const now = new Date();
    const tooYoungYear = now.getUTCFullYear() - (MIN_AGE - 1);
    const iso = `${tooYoungYear}-01-01`;
    const result = parseDob(iso);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(new RegExp(`${MIN_AGE} or older`));
  });

  it('accepts someone who turns exactly MIN_AGE today', () => {
    const now = new Date();
    const y = now.getUTCFullYear() - MIN_AGE;
    const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const iso = `${y}-${mo}-${d}`;
    const result = parseDob(iso);
    expect(result.ok).toBe(true);
  });
});
