import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IntelHexError, loadIntelHex } from '../src/mcu/intel-hex.js';
import { FIXTURES } from './helpers/run-fixture.js';

describe('loadIntelHex', () => {
  it('loads data records', () => {
    const target = new Uint8Array(16);
    const result = loadIntelHex(':0400000001020304F2\n:00000001FF\n', target);
    expect([...target.slice(0, 4)]).toEqual([1, 2, 3, 4]);
    expect(result).toEqual({ bytesWritten: 4, highestAddress: 3 });
  });

  it('honours extended linear address records', () => {
    const target = new Uint8Array(0x20000);
    loadIntelHex(':020000040001F9\n:01000000AA55\n:00000001FF\n', target);
    expect(target[0x10000]).toBe(0xaa);
    expect(target[0]).toBe(0);
  });

  it('honours extended segment address records', () => {
    const target = new Uint8Array(0x20000);
    loadIntelHex(':020000021000EC\n:01000000AA55\n:00000001FF\n', target);
    expect(target[0x10000]).toBe(0xaa);
  });

  it('rejects bad checksums, truncated files and out-of-range data', () => {
    expect(() => loadIntelHex(':0400000001020304F3\n:00000001FF\n', new Uint8Array(16))).toThrow(/checksum/);
    expect(() => loadIntelHex(':0400000001020304F2\n', new Uint8Array(16))).toThrow(/end-of-file/);
    expect(() => loadIntelHex(':0400000001020304F2\n:00000001FF\n', new Uint8Array(2))).toThrow(/beyond/);
    expect(() => loadIntelHex('hello\n', new Uint8Array(2))).toThrow(IntelHexError);
  });

  it('loads an arduino-cli build', () => {
    const hex = readFileSync(join(FIXTURES, 'blink', 'blink.hex'), 'utf8');
    const result = loadIntelHex(hex, new Uint8Array(0x8000));
    expect(result.bytesWritten).toBe(1966);
  });
});
