import { feeDiffers, invoiceFeeCents, isLiveSubStatus, shouldRepriceInvoice } from '../supabase/functions/_shared/fees';

describe('feeDiffers', () => {
  it('treats a missing or unparsable fee as needing a write', () => {
    expect(feeDiffers(null, 5)).toBe(true);
    expect(feeDiffers(undefined, 5)).toBe(true);
    expect(feeDiffers('', 5)).toBe(true);
    expect(feeDiffers('abc', 5)).toBe(true);
  });
  it('compares to two decimals', () => {
    expect(feeDiffers(10, 10)).toBe(false);
    expect(feeDiffers('10.00', 10)).toBe(false);
    expect(feeDiffers(10, 5)).toBe(true);
    expect(feeDiffers(5, 10)).toBe(true);
    expect(feeDiffers(5.004, 5)).toBe(false);
    expect(feeDiffers(5.01, 5)).toBe(true);
  });
});

describe('invoiceFeeCents', () => {
  it('rounds to the cent and never goes negative', () => {
    expect(invoiceFeeCents(18000, 10)).toBe(1800);
    expect(invoiceFeeCents(18000, 5)).toBe(900);
    expect(invoiceFeeCents(999, 5)).toBe(50);
    expect(invoiceFeeCents(0, 5)).toBe(0);
    expect(invoiceFeeCents(-500, 5)).toBe(0);
    expect(invoiceFeeCents(NaN, 5)).toBe(0);
  });
});

describe('isLiveSubStatus / shouldRepriceInvoice', () => {
  it('only live subscriptions and draft renewal invoices are re-priced', () => {
    expect(isLiveSubStatus('active')).toBe(true);
    expect(isLiveSubStatus('past_due')).toBe(true);
    expect(isLiveSubStatus('canceled')).toBe(false);
    expect(isLiveSubStatus(null)).toBe(false);
    expect(shouldRepriceInvoice('subscription_cycle', 'draft')).toBe(true);
    expect(shouldRepriceInvoice('subscription_create', 'draft')).toBe(false);
    expect(shouldRepriceInvoice('subscription_cycle', 'open')).toBe(false);
    expect(shouldRepriceInvoice('manual', 'draft')).toBe(true);
  });
});
