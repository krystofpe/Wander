// npm run art:draw: writes art/<name>.aseprite from each hand-drawn sheet in tools/art/sprites/ (indexed colour,
// palette index = colour role, frames named by tags, points as slices), and art/palette.gpl. After this the
// .aseprite files can be opened and edited in Aseprite; `npm run art` exports them for the game.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DAYLIGHT, ROLE_COUNT, ROLES, labToBytes } from '../../src/palette.ts';
import { ROOT } from '../headless.ts';
import { LEGEND, check } from './legend.ts';
import type { Sheet } from './legend.ts';

/** The authoring palette: each role's daylight colour (meadow), made unique so every index reads distinctly. */
export function authoringPalette(): [number, number, number][] {
  const seen = new Set<string>();
  const out: [number, number, number][] = [[0, 0, 0]];
  const b = new Uint8Array(3);
  const src = DAYLIGHT.meadow;
  for (let r = 1; r < 256; r++) {
    if (r < ROLE_COUNT) labToBytes(src[r * 3], src[r * 3 + 1], src[r * 3 + 2], b, 0);
    else b.set([255, 0, 255]);
    let rgb: [number, number, number] = [b[0], b[1], b[2]];
    while (seen.has(rgb.join(','))) rgb = [rgb[0], rgb[1], (rgb[2] + 1) % 256];
    seen.add(rgb.join(','));
    out.push(rgb);
  }
  return out;
}

const dir = join(ROOT, 'art');
mkdirSync(dir, { recursive: true });
const pal = authoringPalette();
const gpl = ['GIMP Palette', 'Name: Wander roles', 'Columns: 8', '#', '# Index = colour role (src/palette.ts). Index 0 is clear. Colours are daylight references only:', '# the game grades every role by the hour, the biome and the depth.', '#'];
pal.forEach((c, i) => gpl.push(`${String(c[0]).padStart(3)} ${String(c[1]).padStart(3)} ${String(c[2]).padStart(3)}\t${i === 0 ? 'clear' : i < ROLE_COUNT ? `${ROLES[i].family} ${ROLES[i].step}` : 'unused'}`));
writeFileSync(join(dir, 'palette.gpl'), `${gpl.join('\n')}\n`);

const names = readdirSync(join(ROOT, 'tools', 'art', 'sprites')).filter((f) => f.endsWith('.ts')).map((f) => f.replace(/\.ts$/, ''));
for (const name of names) {
  const sheet = ((await import(`./sprites/${name}.ts`)) as { SHEET: Sheet }).SHEET;
  check(sheet);
  const lua: string[] = [];
  lua.push(`local spr = Sprite(${sheet.w}, ${sheet.h}, ColorMode.INDEXED)`);
  lua.push('spr.transparentColor = 0');
  lua.push('local pal = Palette(256)');
  pal.forEach((c, i) => lua.push(`pal:setColor(${i}, Color{ r=${c[0]}, g=${c[1]}, b=${c[2]}, a=${i === 0 ? 0 : 255} })`));
  lua.push('spr:setPalette(pal)');
  lua.push('local layer = spr.layers[1]', "layer.name = 'art'");
  let f = 0;
  for (const tag of sheet.tags) {
    const first = f + 1;
    tag.frames.forEach((rows, i) => {
      f++;
      if (f > 1) lua.push('spr:newEmptyFrame()');
      const ms = Array.isArray(tag.ms) ? (tag.ms as number[])[i] : (tag.ms as number);
      lua.push(`spr.frames[${f}].duration = ${ms / 1000}`);
      lua.push(`do local img = Image(${sheet.w}, ${sheet.h}, ColorMode.INDEXED)`, 'img:clear(0)');
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const idx = LEGEND[row[x]];
          if (idx !== 0) lua.push(`img:drawPixel(${x}, ${y}, ${idx})`);
        }
      });
      lua.push(`spr:newCel(layer, ${f}, img, Point(0, 0)) end`);
    });
    lua.push(`do local t = spr:newTag(${first}, ${f}); t.name = '${tag.name}' end`);
  }
  for (const [p, [x, y]] of Object.entries(sheet.points ?? {})) lua.push(`do local s = spr:newSlice(Rectangle(${x}, ${y}, 1, 1)); s.name = '${p}' end`);
  lua.push(`spr:saveAs('${join(dir, `${name}.aseprite`)}')`, 'spr:close()');
  const script = join(dir, `.${name}.lua`);
  writeFileSync(script, lua.join('\n'));
  execFileSync('aseprite', ['-b', '--script', script], { stdio: 'inherit' });
  execFileSync('rm', [script]);
  process.stdout.write(`art/${name}.aseprite: ${f} frames\n`);
}
