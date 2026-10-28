import { parseDuration } from '../sim/time.js';

export interface PressStimulus {
  ref: string;
  atPs: number;
  durationPs: number;
}

export interface SerialStimulus {
  ref: string;
  atPs: number;
  bytes: number[];
}

const DEFAULT_PRESS_PS = parseDuration('100ms');

/** Parses "SW1@1s:3.2s" (press at 1 s, hold 3.2 s) or "SW1@1s" (hold 100 ms). */
export function parsePress(spec: string): PressStimulus {
  const match = /^([^@]+)@([^:]+)(?::(.+))?$/.exec(spec);
  if (!match) throw new Error(`--press "${spec}": expected REF@TIME[:DURATION], e.g. SW1@1s:3.2s`);
  return {
    ref: match[1]!,
    atPs: parseDuration(match[2]!),
    durationPs: match[3] ? parseDuration(match[3]) : DEFAULT_PRESS_PS,
  };
}

/** Parses "ARD1@1s=text"; the text understands \n, \r, \t, \\ and \xNN. */
export function parseSerialIn(spec: string): SerialStimulus {
  const match = /^([^@]+)@([^=]+)=(.*)$/s.exec(spec);
  if (!match) throw new Error(`--serial-in "${spec}": expected REF@TIME=TEXT, e.g. ARD1@1s=1`);
  return { ref: match[1]!, atPs: parseDuration(match[2]!), bytes: unescapeBytes(match[3]!) };
}

export function unescapeBytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch !== '\\' || i + 1 >= text.length) {
      bytes.push(ch.charCodeAt(0) & 0xff);
      continue;
    }
    const next = text[++i]!;
    if (next === 'n') bytes.push(0x0a);
    else if (next === 'r') bytes.push(0x0d);
    else if (next === 't') bytes.push(0x09);
    else if (next === 'x' && /^[0-9a-fA-F]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(next.charCodeAt(0) & 0xff);
  }
  return bytes;
}
