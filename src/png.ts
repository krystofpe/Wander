// A small PNG decoder for 8-bit greyscale, RGB and RGBA images: enough for elevation tiles. Pure.
import { Buffer } from 'node:buffer';
import { inflateSync } from 'node:zlib';

export type Png = { readonly width: number; readonly height: number; readonly channels: number; readonly data: Uint8Array };

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** Channels per colour type: greyscale, RGB, greyscale + alpha, RGBA. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function decodePng(bytes: Uint8Array): Png {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  let p = 8;
  while (p + 8 <= bytes.length) {
    const length = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    if (type === 'IHDR') {
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
      bitDepth = bytes[p + 16];
      colorType = bytes[p + 17];
      interlace = bytes[p + 20];
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(bytes.buffer, bytes.byteOffset + p + 8, length));
    } else if (type === 'IEND') {
      break;
    }
    p += 12 + length;
  }
  const channels = CHANNELS[colorType];
  if (bitDepth !== 8 || channels === undefined || interlace !== 0) {
    throw new Error(`unsupported PNG: ${bitDepth}-bit, colour type ${colorType}, interlace ${interlace}`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = new Uint8Array(stride * height);
  let q = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[q++];
    const row = y * stride;
    const prev = row - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[q++];
      const a = i >= channels ? data[row + i - channels] : 0;
      const b = y > 0 ? data[prev + i] : 0;
      const c = y > 0 && i >= channels ? data[prev + i - channels] : 0;
      let v: number;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`unknown PNG filter ${filter}`);
      data[row + i] = v & 255;
    }
  }
  return { width, height, channels, data };
}
