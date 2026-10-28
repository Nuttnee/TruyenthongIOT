import { describe, expect, it } from 'vitest';
import { runFixture } from './helpers/run-fixture.js';

const S = 1e12;
const MS = 1e9;

describe('F1 blink', () => {
  it('toggles D13 every second within 0.1% and prints its banner', async () => {
    const run = await runFixture('blink', '10s');
    const changes = run.ledChanges('D1');

    expect(changes.length).toBe(10);
    changes.forEach((change, i) => expect(change.on).toBe(i % 2 === 0));
    for (let i = 1; i < changes.length; i++) {
      const halfPeriod = changes[i]!.t - changes[i - 1]!.t;
      expect(Math.abs(halfPeriod - S) / S).toBeLessThan(0.001);
    }
    expect(run.lines.map((l) => l.text)).toEqual(['blink ready']);
  });
});

describe('F2 B2 bai 1.2 (button long-press, LED active-low)', () => {
  it('enters config mode after a 3.2 s press and handles a single click', async () => {
    const run = await runFixture('b2-bai1.2', '7s', {
      presses: [
        { ref: 'SW1', at: '1s', hold: '3.2s' },
        { ref: 'SW1', at: '5s', hold: '150ms' },
      ],
    });
    const text = run.lines.map((l) => l.text);
    expect(text).toEqual(['He thong san sang - Che do VAN HANH', '>> CHE DO CAU HINH <<', 'Baud rate: 9600']);

    // Released at 4.2 s: six toggles 100 ms apart light the LED three times.
    const onsAfterRelease = run.ledChanges('D1').filter((c) => c.on && c.t > 4.2 * S && c.t < 5 * S);
    expect(onsAfterRelease.map((c) => Math.round((c.t - 4.2 * S) / MS))).toEqual([0, 200, 400]);

    // The click at 5 s is acted on 500 ms after release: LED on for 300 ms.
    const click = run.ledChanges('D1').filter((c) => c.t > 5 * S);
    expect(click.map((c) => c.on)).toEqual([true, false]);
    expect(Math.round((click[1]!.t - click[0]!.t) / MS)).toBe(300);
    expect(click[0]!.t).toBeGreaterThan(5.65 * S);
  });

  it('stays in run mode when the press is shorter than 3 s', async () => {
    const run = await runFixture('b2-bai1.2', '3s', { presses: [{ ref: 'SW1', at: '0.5s', hold: '1s' }] });
    expect(run.lines.map((l) => l.text)).toEqual(['He thong san sang - Che do VAN HANH']);
  });
});

describe('F3 B2 bai 1.1 (two Arduinos over SoftwareSerial)', () => {
  it('relays commands from ARD1 to ARD2 and the replies back', async () => {
    const run = await runFixture('b2-bai1.1', '2s', {
      serial: [
        { ref: 'ARD1', at: '0.5s', text: '1' },
        { ref: 'ARD1', at: '1s', text: '2' },
        { ref: 'ARD1', at: '1.5s', text: 'a' },
      ],
    });

    const ard1 = run.lines.filter((l) => l.ref === 'ARD1' && l.t > 0.4 * S).map((l) => l.text);
    expect(ard1).toEqual(['LED1: BAT', 'LED2: BAT', 'LED1: TAT']);

    const led1 = run.ledChanges('D1').filter((c) => c.t > 0.4 * S);
    expect(led1.map((c) => c.on)).toEqual([true, false]);
    expect(run.ledChanges('D2').filter((c) => c.t > 0.4 * S).map((c) => c.on)).toEqual([true]);
    expect(run.ledChanges('D3').filter((c) => c.t > 0.4 * S)).toEqual([]);

    // Cross-MCU signals may arrive up to one quantum (1 µs) late, never more.
    expect(run.sim.stats().maxLatenessPs).toBeLessThanOrEqual(1e6);
  });
});
