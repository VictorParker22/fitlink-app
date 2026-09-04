import { Motion, Ease, SpringGesture } from '../constants/motion';

describe('Motion', () => {
  it('matches the documented timing scale', () => {
    expect(Motion.instant).toBe(120);
    expect(Motion.quick).toBe(200);
    expect(Motion.screen).toBe(320);
    expect(Motion.moment).toBe(600);
    expect(Motion.monogram).toBe(1100);
    expect(Motion.reduced).toBe(200);
  });
});

describe('Ease', () => {
  it('exposes an out easing for anything entering', () => {
    expect(typeof Ease.out).toBe('function');
  });

  it('exposes an inOut easing for anything moving between resting places', () => {
    expect(typeof Ease.inOut).toBe('function');
  });
});

describe('SpringGesture', () => {
  it('matches the documented spring tuning', () => {
    expect(SpringGesture).toEqual({ damping: 18, stiffness: 180, mass: 1 });
  });
});
