import { describe, expect, it } from 'vitest';
import { QualityGovernor } from './quality-governor.ts';

function feed(governor: QualityGovernor, fps: number, seconds: number) {
  const changes = [];
  for (let t = 0; t < seconds; t += 1 / fps) {
    const change = governor.sample(1 / fps);
    if (change) changes.push(change);
  }
  return changes;
}

describe('QualityGovernor', () => {
  it('steps down after sustained low frame rates', () => {
    const governor = new QualityGovernor('ultra');
    expect(feed(governor, 30, 4.5)).toEqual(['high']);
    expect(feed(governor, 30, 4.5)).toEqual(['medium']);
  });

  it('ignores short dips and hitches', () => {
    const governor = new QualityGovernor('high');
    expect(feed(governor, 30, 2.1)).toEqual([]);
    expect(governor.sample(2)).toBeNull();
    expect(feed(governor, 60, 4)).toEqual([]);
  });

  it('steps up only once after a long stretch of headroom', () => {
    const governor = new QualityGovernor('medium');
    expect(feed(governor, 120, 31)).toEqual(['high']);
    expect(feed(governor, 120, 60)).toEqual([]);
  });

  it('never goes below low', () => {
    const governor = new QualityGovernor('low');
    expect(feed(governor, 10, 10)).toEqual([]);
  });
});
