/**
 * A phantom column must be recognised whichever layer reports it: Postgres
 * (42703) or PostgREST's schema cache (PGRST204). The live-class insert died
 * on the second one for a whole day because only the first was known.
 */
import { isMissingSchemaError } from '../lib/schemaErrors';

describe('isMissingSchemaError', () => {
  it('recognises the Postgres codes', () => {
    expect(isMissingSchemaError({ code: '42703' })).toBe(true);
    expect(isMissingSchemaError({ code: '42P01' })).toBe(true);
  });

  it('recognises PostgREST schema-cache misses by code and by message', () => {
    expect(isMissingSchemaError({ code: 'PGRST204', message: "Could not find the 'category' column of 'live_classes' in the schema cache" })).toBe(true);
    expect(isMissingSchemaError({ message: "Could not find the 'duration_minutes' column of 'live_classes' in the schema cache" })).toBe(true);
    expect(isMissingSchemaError({ message: 'column "slot_index" does not exist' })).toBe(true);
  });

  it('does not swallow real failures', () => {
    expect(isMissingSchemaError({ code: '23502', message: 'null value in column "title" violates not-null constraint' })).toBe(false);
    expect(isMissingSchemaError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
  });
});
