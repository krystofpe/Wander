// npm run site -- [--out DIR]
// Builds the published page (GitHub Pages): plain files with no server behind them. The TypeScript of web/ and src/
// with its types stripped (as the local server does) and its imports pointed at .js, the page marked as the site
// (the live road: one wanderer for everyone, nothing saved), the style, the font and its licence, the sprite atlas.
import { stripTypeScriptTypes } from 'node:module';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { flags } from './headless.ts';

const root = join(import.meta.dirname, '..');
const out = join(root, flags(process.argv.slice(2)).get('out') ?? 'dist');
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
  } else if (rel !== join('web', 'index.html')) {
    put(rel, readFileSync(join(root, rel)));
  }
}
// The page: marked as the site, its script the built one.
const html = readFileSync(join(root, 'web', 'index.html'), 'utf8');
const page = html.replace('<html lang="en">', '<html lang="en" data-site>').replace('src="web/main.ts"', 'src="web/main.js"');
if (!page.includes('data-site') || !page.includes('web/main.js')) throw new Error('web/index.html: could not mark the page');
put('index.html', page);
for (const name of ['atlas.png', 'atlas.json']) put(join('assets', name), readFileSync(join(root, 'assets', name)));
put('.nojekyll', '');
const size = files(relative(root, out)).reduce((n, f) => n + statSync(join(root, f)).size, 0);
process.stdout.write(`${relative(root, out)}: ${scripts} scripts, ${(size / 1048576).toFixed(1)} MB\n`);
