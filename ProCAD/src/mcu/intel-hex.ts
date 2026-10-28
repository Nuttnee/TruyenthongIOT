export class IntelHexError extends Error {
  override name = 'IntelHexError';
}

export interface HexLoadResult {
  /** Number of data bytes written into the target. */
  bytesWritten: number;
  /** Highest absolute address written, or -1 if the file held no data. */
  highestAddress: number;
}

/**
 * Loads an Intel HEX file into `target`.
 *
 * Unlike the loader in the avr8js demo, this one verifies checksums and honours
 * extended segment (02) and extended linear (04) address records, so it also
 * works for parts with more than 64 KiB of flash.
 */
export function loadIntelHex(text: string, target: Uint8Array): HexLoadResult {
  let base = 0;
  let bytesWritten = 0;
  let highestAddress = -1;
  let sawEof = false;

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length && !sawEof; index++) {
    const line = lines[index]!.trim();
    if (line === '') continue;

    const where = `line ${index + 1}`;
    if (line[0] !== ':' || line.length < 11 || (line.length - 1) % 2 !== 0) {
      throw new IntelHexError(`${where}: not an Intel HEX record`);
    }

    const bytes: number[] = [];
    for (let i = 1; i < line.length; i += 2) {
      const byte = parseInt(line.slice(i, i + 2), 16);
      if (Number.isNaN(byte)) throw new IntelHexError(`${where}: invalid hex digits`);
      bytes.push(byte);
    }

    const count = bytes[0]!;
    if (bytes.length !== count + 5) {
      throw new IntelHexError(`${where}: length field says ${count} bytes, record has ${bytes.length - 5}`);
    }
    const checksum = bytes.reduce((sum, byte) => sum + byte, 0) & 0xff;
    if (checksum !== 0) {
      throw new IntelHexError(`${where}: checksum mismatch`);
    }

    const offset = (bytes[1]! << 8) | bytes[2]!;
    const type = bytes[3]!;
    const data = bytes.slice(4, 4 + count);

    switch (type) {
      case 0x00:
        for (let i = 0; i < data.length; i++) {
          const address = base + offset + i;
          if (address >= target.length) {
            throw new IntelHexError(
              `${where}: address 0x${address.toString(16)} is beyond the ${target.length}-byte flash`,
            );
          }
          target[address] = data[i]!;
          bytesWritten++;
          highestAddress = Math.max(highestAddress, address);
        }
        break;
      case 0x01:
        sawEof = true;
        break;
      case 0x02:
        base = ((data[0]! << 8) | data[1]!) * 16;
        break;
      case 0x04:
        base = ((data[0]! << 8) | data[1]!) * 0x10000;
        break;
      case 0x03:
      case 0x05:
        // Start address records only matter for loaders that jump to an entry point.
        break;
      default:
        throw new IntelHexError(`${where}: unknown record type 0x${type.toString(16)}`);
    }
  }

  if (!sawEof) {
    throw new IntelHexError('missing end-of-file record');
  }
  return { bytesWritten, highestAddress };
}
