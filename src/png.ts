// Decoding an 8-bit indexed PNG to its palette indices (the atlas: each index is a colour role). Browsers only hand
// out RGBA, so this reads the file itself, inflating with the standard DecompressionStream. Works in Node too.

export type Indexed = { readonly w: number; readonly h: number; readonly indices: Uint8Array };

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodeIndexedPng(buf: ArrayBuffer): Promise<Indexed> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error('not a PNG');
  let at = 8;
  let w = 0;
  let h = 0;
  const idat: Uint8Array[] = [];
  while (at < bytes.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const body = bytes.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      w = view.getUint32(at + 8);
      h = view.getUint32(at + 12);
      if (body[8] !== 8 || body[9] !== 3) throw new Error(`atlas must be 8-bit indexed (bit depth ${body[8]}, colour type ${body[9]})`);
      if (body[12] !== 0) throw new Error('interlaced PNGs are not supported');
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + len;
  }
  let total = 0;
  for (const c of idat) total += c.length;
  const joined = new Uint8Array(total);
  let o = 0;
  for (const c of idat) {
    joined.set(c, o);
    o += c.length;
  }
  const raw = await inflate(joined);
  const out = new Uint8Array(w * h);
  const stride = w + 1;
  for (let y = 0; y < h; y++) {
    const filter = raw[y * stride];
    for (let x = 0; x < w; x++) {
      const cur = raw[y * stride + 1 + x];
      const a = x > 0 ? out[y * w + x - 1] : 0;
      const b = y > 0 ? out[(y - 1) * w + x] : 0;
      const c = x > 0 && y > 0 ? out[(y - 1) * w + x - 1] : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = cur;
          break;
        case 1:
          v = cur + a;
          break;
        case 2:
          v = cur + b;
          break;
        case 3:
          v = cur + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`bad PNG filter ${filter}`);
      }
      out[y * w + x] = v & 255;
    }
  }
  return { w, h, indices: out };
}
