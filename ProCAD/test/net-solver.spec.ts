import { describe, expect, it } from 'vitest';
import { NetSolver, Strength } from '../src/sim/net-solver.js';

function solved(solver: NetSolver, net: number) {
  solver.solve();
  return solver.state(net);
}

describe('NetSolver', () => {
  it('leaves undriven nets floating', () => {
    const solver = new NetSolver(1);
    expect(solved(solver, 0)).toEqual({ level: 'Z', strength: Strength.Z });
  });

  it('lets the strongest driver win and marks equal-strength conflicts as X', () => {
    const solver = new NetSolver(1);
    const a = solver.addDriver(0, 1, Strength.Weak);
    solver.addDriver(0, 0, Strength.Strong);
    expect(solved(solver, 0)).toEqual({ level: 0, strength: Strength.Strong });

    solver.setDriver(a, 1, Strength.Strong);
    expect(solved(solver, 0)).toEqual({ level: 'X', strength: Strength.Strong });
  });

  it('models a pull-up with a button to ground', () => {
    // net 0 = +5V, net 1 = input, net 2 = GND; R between 0 and 1, button between 1 and 2.
    const solver = new NetSolver(3);
    solver.addDriver(0, 1, Strength.Supply);
    solver.addDriver(2, 0, Strength.Supply);
    solver.addResistor(0, 1);
    const button = solver.addSwitch(1, 2);
    expect(solved(solver, 1)).toEqual({ level: 1, strength: Strength.Pull });

    solver.setSwitch(button, true);
    expect(solved(solver, 1)).toEqual({ level: 0, strength: Strength.Supply });

    solver.setSwitch(button, false);
    expect(solved(solver, 1)).toEqual({ level: 1, strength: Strength.Pull });
  });

  it('lets an output pin override the resistor feeding an LED anode', () => {
    // +5V (0) -R- pin (1) -R- anode (2): the pin's strong 0 beats the pull from +5V.
    const solver = new NetSolver(3);
    solver.addDriver(0, 1, Strength.Supply);
    const pin = solver.addDriver(1);
    solver.addResistor(0, 1);
    solver.addResistor(1, 2);
    expect(solved(solver, 2)).toEqual({ level: 1, strength: Strength.Pull });

    solver.setDriver(pin, 0, Strength.Strong);
    expect(solved(solver, 2)).toEqual({ level: 0, strength: Strength.Pull });
  });

  it('reports a resistive divider as X (needs the analog solver)', () => {
    const solver = new NetSolver(3);
    solver.addDriver(0, 1, Strength.Supply);
    solver.addDriver(2, 0, Strength.Supply);
    solver.addResistor(0, 1);
    solver.addResistor(1, 2);
    expect(solved(solver, 1).level).toBe('X');
  });

  it('does not keep a stale level circulating around a loop of resistors', () => {
    const solver = new NetSolver(3);
    const pin = solver.addDriver(0, 1, Strength.Strong);
    solver.addResistor(0, 1);
    solver.addResistor(1, 2);
    solver.addResistor(2, 1);
    expect(solved(solver, 2).level).toBe(1);

    solver.setDriver(pin, 0, Strength.Z);
    expect(solved(solver, 2)).toEqual({ level: 'Z', strength: Strength.Z });
  });

  it('only reports nets whose state changed', () => {
    const solver = new NetSolver(2);
    const a = solver.addDriver(0, 1, Strength.Strong);
    solver.addDriver(1, 0, Strength.Strong);
    expect(solver.solve().sort()).toEqual([0, 1]);
    solver.setDriver(a, 0, Strength.Strong);
    expect(solver.solve()).toEqual([0]);
    expect(solver.solve()).toEqual([]);
  });
});
