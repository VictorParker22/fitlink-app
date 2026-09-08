import { asEmail, asPhoneDigits, escapeLike } from '../supabase/functions/_shared/contact';

describe('asEmail', () => {
  it('normalises a real address and refuses everything else', () => {
    expect(asEmail('  Coach@Example.COM ')).toBe('coach@example.com');
    expect(asEmail('not an email')).toBeNull();
    expect(asEmail('')).toBeNull();
    expect(asEmail(42)).toBeNull();
    expect(asEmail('a@b.' + 'c'.repeat(260))).toBeNull();
  });
});

describe('asPhoneDigits', () => {
  it('keeps digits within E.164 bounds', () => {
    expect(asPhoneDigits('+1 (555) 000-1111')).toBe('15550001111');
    expect(asPhoneDigits('12345')).toBeNull();
    expect(asPhoneDigits('1'.repeat(16))).toBeNull();
    expect(asPhoneDigits(null)).toBeNull();
  });
});

describe('escapeLike', () => {
  it('turns wildcard characters into literals', () => {
    expect(escapeLike('%@gmail.com')).toBe('\\%@gmail.com');
    expect(escapeLike('a_b@x.io')).toBe('a\\_b@x.io');
    expect(escapeLike('back\\slash')).toBe('back\\\\slash');
    expect(escapeLike('plain@x.io')).toBe('plain@x.io');
  });
  it('a wildcard email still passes asEmail, which is why the escape is needed', () => {
    expect(asEmail('%@gmail.com')).toBe('%@gmail.com');
    expect(escapeLike(asEmail('%@gmail.com')!)).toBe('\\%@gmail.com');
  });
});
