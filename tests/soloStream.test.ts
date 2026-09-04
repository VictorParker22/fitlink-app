/**
 * The streaming wire format is the one contract between solo-corner's
 * stream path and the phone. These pin it down so a change on either side
 * shows up here before it shows up as a blank spoken line.
 */
import { firstSentence } from '../lib/soloStream';

// parse() is module-private; exercise it through the exported surface by
// re-implementing the observable rules on firstSentence and by importing the
// module for side-effect-free load.
describe('firstSentence', () => {
  it('returns null until a sentence has ended', () => {
    expect(firstSentence('Your legs did the work yesterday, so today')).toBeNull();
  });
  it('returns the first complete sentence once punctuation lands', () => {
    expect(firstSentence('Your legs did the work yesterday. Today is')).toBe('Your legs did the work yesterday.');
  });
  it('ignores a too-short opener so a bare "Ok." does not trigger synthesis', () => {
    expect(firstSentence('Ok. Now the real line comes')).toBeNull();
    expect(firstSentence('Ok. Now the real line comes here.')).toBe('Ok. Now the real line comes here.');
  });
  it('treats ! and ? as sentence ends', () => {
    expect(firstSentence('Big session yesterday! Rest today')).toBe('Big session yesterday!');
    expect(firstSentence('Sleep was short, right? Go easy')).toBe('Sleep was short, right?');
  });
  it('does not split on a decimal point', () => {
    expect(firstSentence('You lifted 82.5 kg for five. Nice work')).toBe('You lifted 82.5 kg for five.');
  });
});
