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
// The workspace is the public homepage. Its source filename is "workspace",
// so normal static generation assigns it a /workspace canonical. Correct that
// after promoting it to the root to keep the sitemap and canonical signal aligned.
const homepagePath = join(out, 'index.html');
let homepage = await readFile(homepagePath, 'utf8');
homepage = homepage.replaceAll('https://pdf.mv/workspace', 'https://pdf.mv');
await writeFile(homepagePath, homepage);
await rm(join(out, 'brand/preview'), { recursive: true, force: true });
const manifest = {};
await mkdir(join(out, '_engine-parts'), { recursive: true });

const informationPages = {
  '404.html': {
    title: 'Page not found',
    description: 'The page you requested is not available.',
    heading: 'That page is not here.',
    body: '<p>Try the PDF workspace instead.</p>',
  },
  'about.html': {
    title: 'About PDF.MV',
    description: 'A simple, private way to work with PDFs online.',
    heading: 'PDF tools without the fuss.',
    body: '<p>PDF.MV is a free set of browser-based tools for everyday PDF tasks. Your files stay on your device while you work.</p>',
  },
  'contact.html': {
    title: 'Contact PDF.MV',
    description: 'Get in touch with PDF.MV.',
    heading: 'Get in touch.',
    body: '<p>For questions or feedback, email <a href="mailto:hi@pdf.mv">hi@pdf.mv</a>.</p>',
  },
  'faq.html': {
    title: 'PDF.MV FAQ',
    description: 'Quick answers about using PDF.MV.',
    heading: 'A few quick answers.',
    body: '<dl><dt>Is it free?</dt><dd>Yes. PDF.MV is free to use and does not require an account.</dd><dt>Are my files uploaded?</dt><dd>No. Supported tools process files locally in your browser.</dd><dt>Does it work on mobile?</dt><dd>Yes, on modern mobile and desktop browsers.</dd></dl>',
  },
  'privacy.html': {
    title: 'Privacy at PDF.MV',
    description: 'How PDF.MV handles your files and information.',
    heading: 'Your files stay yours.',
    body: '<p>PDF.MV is designed to process supported files in your browser. We do not require an account, and your files are not sent to a PDF.MV server for processing.</p><p>If you email us, we use that message only to reply or provide support.</p>',
  },
  'terms.html': {
    title: 'PDF.MV terms',
    description: 'Terms for using PDF.MV.',
    heading: 'Simple terms.',
    body: '<p>PDF.MV is provided as-is for personal and professional PDF tasks. Please make sure you have the right to use the files you process, and keep your own backups before downloading or sharing important documents.</p><p>For support, email <a href="mailto:hi@pdf.mv">hi@pdf.mv</a>.</p>',
  },
};

function renderInformationPage(
  { title, description, heading, body },
  is404 = false
) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,follow" />
    <title>${title} · PDF.MV</title>
    <meta name="description" content="${description}" />
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; background: #101827; color: #f8fafc; display: grid; place-items: center; padding: 24px; }
      main { width: min(100%, 620px); }
      .brand { color: #a5b4fc; font-weight: 800; letter-spacing: -.03em; text-decoration: none; }
      h1 { font-size: clamp(2rem, 7vw, 3.5rem); line-height: 1.04; letter-spacing: -.055em; margin: 24px 0 16px; }
      p, dd { color: #cbd5e1; font-size: 1.05rem; line-height: 1.7; }
      a { color: #c7d2fe; }
      dt { color: #f8fafc; font-weight: 700; margin-top: 18px; }
      dd { margin: 4px 0 0; }
      .action { display: inline-block; margin-top: 20px; background: #eef2ff; color: #1e1b4b; border-radius: 999px; padding: 12px 18px; font-weight: 750; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <a class="brand" href="https://pdf.mv">pdf.mv</a>
      <h1>${heading}</h1>
      ${body}
      <a class="action" href="https://pdf.mv">${is404 ? 'Go to PDF.MV' : 'Open PDF.MV'}</a>
    </main>
  </body>
</html>`;
}

async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '_engine-parts') await visit(file);
      continue;
    }
    if (file.endsWith('.html') && entry.name !== 'licensing.html') {
      let html = await readFile(file, 'utf8');
      // Keep every search-facing reference consistent with this deployment's
      // canonical domain and visible product name. This runs after static page
      // generation so localized pages are covered too.
      html = html
        .replaceAll('https://www.bentopdf.com', 'https://pdf.mv')
        .replaceAll('bentopdf.com', 'pdf.mv')
        .replaceAll('BentoPDF', 'PDF.mv')
        .replaceAll('Bentopdf', 'PDF.mv');
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

// The upstream project ships a sizeable set of company, marketing, and
// commercial-license pages. Replace those inherited surfaces (including their
// generated localized copies) with small PDF.MV information pages so every
// public route has one consistent product identity. Preserve the licensing
// page with its upstream notices and source-code access.
async function replaceInformationPages(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '_engine-parts') await replaceInformationPages(file);
      continue;
    }
    const page = informationPages[entry.name];
    if (!page) continue;
    await writeFile(
      file,
      renderInformationPage(page, entry.name === '404.html')
    );
  }
}
await replaceInformationPages(out);

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

// Static Assets serves the root index and extensionless HTML routes directly.
// Do not add an SPA fallback here: it conflicts with `drop-trailing-slash`
// routing and makes Cloudflare reject the deployment as an infinite redirect.
