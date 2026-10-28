import { mcuPortPin, mcuPowerPinLevel, powerNetLevel } from '../circuit/mapping.js';
import type { MappingResult } from '../circuit/mapping.js';
import type { Netlist, NetNode } from '../circuit/netlist.js';
import { Atmega328p } from '../mcu/atmega328p.js';
import { Button } from '../parts/button.js';
import { Led } from '../parts/led.js';
import { Circuit } from './circuit.js';
import { Strength } from './net-solver.js';
import { Simulation } from './simulation.js';

export class BuildError extends Error {
  override name = 'BuildError';
}

interface PinOnNet {
  node: NetNode;
  net: number;
}

/**
 * Wires mapped components into a runnable simulation.  `programs` holds the
 * flash image for every MCU, keyed by reference.
 */
export function buildSimulation(
  netlist: Netlist,
  mapping: MappingResult,
  programs: ReadonlyMap<string, Uint16Array>,
): Simulation {
  const circuit = new Circuit(netlist.nets.map((net) => net.name));
  const sim = new Simulation(circuit);

  const pinsByRef = new Map<string, PinOnNet[]>();
  netlist.nets.forEach((net, index) => {
    for (const node of net.nodes) {
      const pins = pinsByRef.get(node.ref) ?? [];
      pins.push({ node, net: index });
      pinsByRef.set(node.ref, pins);
    }
  });

  netlist.nets.forEach((net, index) => {
    const level = powerNetLevel(net.name);
    if (level !== null) circuit.addDriver(index, level, Strength.Supply);
    circuit.onNet(index, (state, t) => sim.emit({ kind: 'net', t, net: net.name, level: state.level }));
  });

  for (const { component, model } of mapping.parts) {
    const pins = pinsByRef.get(component.ref) ?? [];
    switch (model.kind) {
      case 'mcu': {
        const program = programs.get(component.ref);
        if (!program) throw new BuildError(`${component.ref}: no firmware loaded`);
        const mcu = new Atmega328p(component.ref, program, model.clockHz);
        sim.mcus.push(mcu);
        wireMcu(sim, mcu, pins, model.pinScheme);
        break;
      }
      case 'resistor': {
        const [a, b] = twoTerminals(pins, ['1', '2']);
        if (a !== undefined && b !== undefined) circuit.solver.addResistor(a, b);
        break;
      }
      case 'led': {
        const anode = pins.find((p) => p.node.pinFunction === 'A' || p.node.pin === '2')?.net;
        const cathode = pins.find((p) => p.node.pinFunction === 'K' || p.node.pin === '1')?.net;
        if (anode === undefined || cathode === undefined) {
          sim.warn(`${component.ref}: LED needs both A and K connected; ignoring it`);
          break;
        }
        const ref = component.ref;
        sim.leds.set(ref, new Led(ref, circuit, anode, cathode, (on, t) => sim.emit({ kind: 'led', t, ref, on })));
        break;
      }
      case 'button': {
        const [a, b] = twoTerminals(pins, ['1', '2']);
        if (a === undefined || b === undefined) {
          sim.warn(`${component.ref}: button needs both pins connected; ignoring it`);
          break;
        }
        const ref = component.ref;
        sim.buttons.set(
          ref,
          new Button(ref, circuit, a, b, (pressed, t) => sim.emit({ kind: 'button', t, ref, pressed })),
        );
        break;
      }
      case 'ignore':
        break;
    }
  }

  circuit.settle(0);
  return sim;
}

function twoTerminals(pins: PinOnNet[], numbers: [string, string]): [number | undefined, number | undefined] {
  return [pins.find((p) => p.node.pin === numbers[0])?.net, pins.find((p) => p.node.pin === numbers[1])?.net];
}

function wireMcu(sim: Simulation, mcu: Atmega328p, pins: PinOnNet[], scheme: 'arduino-uno' | 'atmega'): void {
  const { circuit } = sim;
  const floatingWarned = new Set<string>();

  for (const { node, net } of pins) {
    const powerLevel = mcuPowerPinLevel(node.pinFunction, node.pinType);
    if (powerLevel !== null) {
      circuit.addDriver(net, powerLevel, Strength.Supply);
      continue;
    }

    const portPin = mcuPortPin(scheme, node.pinFunction);
    if (!portPin) continue; // RESET, AREF, VIN, NC: not simulated yet
    const { port, bit } = portPin;

    const driver = circuit.addDriver(net);
    mcu.onPinDrive((p, b, drive) => {
      if (p === port && b === bit) circuit.drive(driver, drive.level, drive.strength, mcu.timePs);
    });

    circuit.onNet(net, (state, t) => {
      if (state.level === 0 || state.level === 1) {
        const high = state.level === 1;
        sim.deliver(mcu, t, () => mcu.setInput(port, bit, high));
        return;
      }
      // Only an input reading a floating or contended net is worth a warning.
      const key = `${port}${bit}`;
      if (mcu.pinDrive(port, bit).strength === Strength.Z && !floatingWarned.has(key)) {
        floatingWarned.add(key);
        const what = state.level === 'X' ? 'is driven both high and low' : 'is floating';
        sim.warn(`${mcu.ref}.${node.pinFunction} (P${port}${bit}) ${what}; keeping its last value`, t);
      }
    });
  }

  mcu.onUartByte((byte) => sim.emit({ kind: 'uart', t: mcu.timePs, ref: mcu.ref, byte }));
}
