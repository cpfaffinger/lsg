import { describe, expect, it } from 'vitest';
import { StateMachine } from './state-machine.ts';

describe('StateMachine', () => {
  it('calls enter/exit hooks and notifies listeners', () => {
    const sm = new StateMachine();
    const log: string[] = [];
    sm.register('boot', { exit: () => log.push('exit boot') });
    sm.register('menu', { enter: (prev) => log.push(`enter menu from ${prev}`) });
    sm.onChange((next) => log.push(`changed ${next}`));
    sm.transition('boot');
    sm.transition('menu');
    expect(log).toEqual(['changed boot', 'exit boot', 'enter menu from boot', 'changed menu']);
  });

  it('rejects invalid transitions', () => {
    const sm = new StateMachine();
    sm.transition('boot');
    expect(() => sm.transition('playing')).toThrow();
  });
});
