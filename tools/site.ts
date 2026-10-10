// npm run site -- [--out DIR] [--serve [PORT]]
// Builds the published page (GitHub Pages): plain files with no server behind them. The TypeScript of web/ and src/
// with its types stripped (as the local server does) and its imports pointed at .js, both pages marked as the site
// (the road: the live road, one wanderer for everyone, nothing saved; the hollow at creature/: each visitor's own
// creature, kept in their browser), the style, the font and its licence, the sprite atlas. With --serve, it then
// serves them as Pages will, to look at here first.
import { stripTypeScriptTypes } from 'node:module';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { flags } from './headless.ts';
import { pagesServer } from './pages.ts';

const root = join(import.meta.dirname, '..');
const f = flags(process.argv.slice(2));
const out = join(root, f.get('out') ?? 'dist');
rmSync(out, { recursive: true, force: true });

const files = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    return statSync(join(root, rel)).isDirectory() ? files(rel) : [rel];
  });
const put = (rel: string, data: string | Buffer): void => {
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  writeFileSync(join(out, rel), data);
};

// Relative imports of .ts files, static and dynamic, become .js.
const IMPORT = /((?:\bfrom|\bimport)\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+?)\.ts\2/g;
let scripts = 0;
for (const rel of [...files('web'), ...files('src')]) {
  if (rel.endsWith('.ts')) {
    const code = stripTypeScriptTypes(readFileSync(join(root, rel), 'utf8')).replace(IMPORT, '$1$2$3.js$2');
    const left = code.match(/(?:from|import)\s*\(?\s*['"]\.{1,2}\/[^'"]+\.ts['"]/);
    if (left !== null) throw new Error(`${rel}: an import still ends in .ts: ${left[0]}`);
    put(rel.replace(/\.ts$/, '.js'), code);
    scripts++;
  } else if (rel !== join('web', 'index.html') && rel !== join('web', 'creature', 'index.html')) {
    put(rel, readFileSync(join(root, rel)));
  }
}
// The pages: marked as the site, their scripts the built ones; the hollow at creature/, as the local server has it.
for (const [from, to, script] of [['web/index.html', 'index.html', 'web/main'], ['web/creature/index.html', 'creature/index.html', 'web/creature/main']] as const) {
  const html = readFileSync(join(root, from), 'utf8');
  const page = html.replace('<html lang="en">', '<html lang="en" data-site>').replace(`${script}.ts"`, `${script}.js"`);
  if (!page.includes('data-site') || !page.includes(`${script}.js"`)) throw new Error(`${from}: could not mark the page`);
  put(to, page);
}
for (const name of ['atlas.png', 'atlas.json']) put(join('assets', name), readFileSync(join(root, 'assets', name)));
put('.nojekyll', '');
const size = files(relative(root, out)).reduce((n, file) => n + statSync(join(root, file)).size, 0);
process.stdout.write(`${relative(root, out)}: ${scripts} scripts, ${(size / 1048576).toFixed(1)} MB\n`);
if (f.has('serve')) {
  const port = Number(f.get('serve'));
  const s = await pagesServer(out, Number.isInteger(port) && port > 0 ? port : 8090);
  process.stdout.write(`the published page, as GitHub Pages will serve it: ${s.base} (the hollow: ${s.base}creature/); Ctrl+C to stop\n`);
}
