import {
  cp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  rm,
  stat,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = join(root, 'dist-cloudflare');
await rm(out, { recursive: true, force: true });
await cp(join(root, 'dist'), out, {
  recursive: true,
  filter: (path) =>
    !path.endsWith('.br') &&
    (!path.endsWith('.gz') || path.includes('libreoffice-wasm')),
});
// The custom workspace is the site's entry point; preserve all engine pages.
await cp(join(out, 'workspace.html'), join(out, 'index.html'));
await rm(join(out, 'brand/preview'), { recursive: true, force: true });
const manifest = {};
await mkdir(join(out, '_engine-parts'), { recursive: true });
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '_engine-parts') await visit(file);
      continue;
    }
    if (file.endsWith('.html')) {
      let html = await readFile(file, 'utf8');
      html = html.replace(
        /(<link[^>]+rel=["']canonical["'][^>]+href=["'])https:\/\/www\.bentopdf\.com/g,
        '$1https://pdf.mv'
      );
      await writeFile(file, html);
    }
    if ((await stat(file)).size <= 20 * 1024 * 1024) continue;
    const data = await readFile(file);
    const hash = createHash('sha256').update(data).digest('hex');
    const parts = [];
    for (let offset = 0; offset < data.length; offset += 20 * 1024 * 1024) {
      const path = `/_engine-parts/${hash}-${parts.length}.bin`;
      await writeFile(
        join(out, path),
        data.subarray(offset, offset + 20 * 1024 * 1024)
      );
      parts.push(path);
    }
    manifest['/' + file.slice(out.length + 1)] = {
      parts,
      size: data.length,
      etag: `"${hash}"`,
    };
    await rm(file);
  }
}
await visit(out);
await writeFile(
  join(root, 'cloudflare/engine-manifest.json'),
  JSON.stringify(manifest, null, 2)
);
await writeFile(
  join(out, '_headers'),
  `/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
`
);
console.log(
  'Prepared Cloudflare assets; streamed engines:',
  Object.keys(manifest)
);

await writeFile(join(out, '_redirects'), '/ /index.html 200\n');
