import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const components = Object.entries(lock.packages)
  .filter(([path]) => path)
  .map(([path, pkg]) => {
    const name = path.split('node_modules/').at(-1);
    return {
      type: 'library',
      name,
      version: pkg.version,
      licenses: pkg.license ? [{ license: { name: pkg.license } }] : [],
      purl: `pkg:npm/${name.replace('@', '%40')}@${pkg.version}`,
      properties: [{ name: 'scope', value: pkg.dev ? 'development' : 'runtime' }],
      ...(pkg.integrity
        ? {
            properties: [
              { name: 'npm.integrity', value: pkg.integrity },
              { name: 'scope', value: pkg.dev ? 'development' : 'runtime' },
            ],
          }
        : {}),
    };
  });
if (existsSync('public/vm/packages.json'))
  for (const p of JSON.parse(readFileSync('public/vm/packages.json', 'utf8')))
    components.push({
      type: 'operating-system',
      name: p.P,
      version: p.V,
      licenses: [{ license: { name: p.L } }],
      purl: `pkg:apk/alpine/${p.P}@${p.V}?arch=${p.A}`,
      properties: [{ name: 'aports.commit', value: p.c }],
    });
writeFileSync(
  'sbom.cdx.json',
  JSON.stringify(
    {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      metadata: { component: { type: 'application', name: 'alpine-pocket', version: '0.1.0' } },
      components,
    },
    null,
    2,
  ) + '\n',
);
let notices = readFileSync('docs/NOTICES_HEADER.md', 'utf8');
if (existsSync('public/vm/packages.json'))
  notices +=
    '\n## Bundled Alpine packages\n\n' +
    JSON.parse(readFileSync('public/vm/packages.json', 'utf8'))
      .map((p) => `- ${p.P} ${p.V}: ${p.L}; origin ${p.o}, aports ${p.c}`)
      .join('\n') +
    '\n\nCorresponding packaging, patches, configurations and upstream sources are distributed at [sources/index.html](sources/index.html).\n';
// Preserve actual license/NOTICE files for every installed package, including build dependencies.
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path || !existsSync(path)) continue;
  const files = readdirSync(path).filter((f) => /^(licen[sc]e|copying|notice)(\.|$)/i.test(f));
  if (!files.length) continue;
  notices += `\n## ${path.split('node_modules/').at(-1)} ${pkg.version}\n\n`;
  for (const f of files) {
    try {
      const text = readFileSync(join(path, f), 'utf8');
      if (text.includes('\0')) continue;
      notices += `### ${f}\n\n\`\`\`text\n${text}\n\`\`\`\n`;
    } catch {
      /* directories are not license text */
    }
  }
}
for (const f of ['v86.LICENSE', 'SeaBIOS.COPYING.LESSER'])
  if (existsSync('docs/licenses/' + f))
    notices += `\n## ${f}\n\n\`\`\`text\n${readFileSync('docs/licenses/' + f, 'utf8')}\n\`\`\`\n`;
writeFileSync('THIRD_PARTY_NOTICES.md', notices);
mkdirSync('public', { recursive: true });
writeFileSync('public/THIRD_PARTY_NOTICES.md', notices);
console.log(`Recorded ${components.length} exact npm components and their available notices.`);
