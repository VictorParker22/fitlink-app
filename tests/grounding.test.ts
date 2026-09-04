import { numbersNotInContext } from '../lib/grounding';

describe('numbersNotInContext', () => {
  it('passes a number that is present in the context', () => {
    const context = 'last_lift: rows 60kg, delta 2.5kg';
    const reply = 'Nice work — rows +2.5kg this week, since you were at 60kg.';
    expect(numbersNotInContext(reply, context)).toEqual([]);
  });

  it('flags a number absent from the context', () => {
    const context = 'last_lift: rows 60kg';
    const reply = 'Try 62.5kg next time.';
    expect(numbersNotInContext(reply, context)).toEqual(['62.5']);
  });

  it('ignores small counts 1-12 as instructions, not data', () => {
    const context = '(no data available yet)';
    const reply = 'Do 3 sets of 10 reps, resting 2 minutes between.';
    expect(numbersNotInContext(reply, context)).toEqual([]);
  });

  it('does not ignore small decimals like 2.5 even though 2 would be ignored', () => {
    const context = '(no data available yet)';
    const reply = 'Add 2.5kg to the bar.';
    expect(numbersNotInContext(reply, context)).toEqual(['2.5']);
  });

  it('dedupes repeated offending numbers', () => {
    const context = '(no data available yet)';
    const reply = 'Your 1RM is 145kg. Yes, 145kg — a new best.';
    expect(numbersNotInContext(reply, context)).toEqual(['145']);
  });
});
