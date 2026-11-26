// 사용: cd tools/vendor-esptool && npm ci && npm run build
// esptool-js(+ pako, atob-lite)를 hub/vendor/esptool.bundle.js 하나로 묶고 라이선스를 복사한다. 외부 CDN 없이 쓰기 위함.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..', '..', 'hub', 'vendor');
const nm = (p) => path.join(here, 'node_modules', p);
const ver = (p) => JSON.parse(fs.readFileSync(nm(p + '/package.json'), 'utf8')).version;
const pkgs = ['esptool-js', 'pako', 'atob-lite'];
const versions = Object.fromEntries(pkgs.map((p) => [p, ver(p)]));

fs.mkdirSync(out, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(here, 'entry.js')],
  bundle: true, format: 'iife', minify: true, target: 'es2020', legalComments: 'eof',
  define: { __ESPTOOL_VERSION__: JSON.stringify(versions['esptool-js']) },
  banner: { js: `/* esptool-js ${versions['esptool-js']} (Apache-2.0), pako ${versions.pako} (MIT AND Zlib), atob-lite ${versions['atob-lite']} (MIT). 라이선스: hub/vendor/licenses/. 다시 만들기: tools/vendor-esptool */` },
  outfile: path.join(out, 'esptool.bundle.js')
});
fs.mkdirSync(path.join(out, 'licenses'), { recursive: true });
const lic = { 'esptool-js': 'LICENSE', pako: 'LICENSE', 'atob-lite': 'LICENSE.md' };
for (const [p, f] of Object.entries(lic)) fs.copyFileSync(nm(p + '/' + f), path.join(out, 'licenses', `${p}-LICENSE.txt`));
fs.writeFileSync(path.join(out, 'VERSIONS.json'), JSON.stringify({ bundle: 'esptool.bundle.js', global: 'window.HubEsptool', esbuild: ver('esbuild'), packages: versions }, null, 2) + '\n');
console.log('hub/vendor/esptool.bundle.js', fs.statSync(path.join(out, 'esptool.bundle.js')).size, 'B', versions);
