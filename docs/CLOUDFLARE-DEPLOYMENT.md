# Deploy PDF MV to Cloudflare

PDF MV uses the `pdf-mv` Worker with Static Assets and the custom domain `pdf.mv`.
Documents are processed in the visitor's browser. This deployment does not store user PDFs.

## Deploy

Use the Node version in `.nvmrc`, then run:

```sh
npm ci
npx wrangler login
npm run deploy:cloudflare
```

`build:cloudflare` runs the production build and prepares `dist-cloudflare`.
The site's `/` entry serves the custom workspace; existing engine HTML URLs remain available.
The animation review page is excluded from production. Cross-origin isolation headers support
SharedArrayBuffer and browser-based Office conversion.

## Large Office engines

Cloudflare Static Assets has a 25 MiB limit per file. The preparation script splits oversized
engine files into content-addressed parts of at most 20 MiB and generates an ignored manifest.
The Worker streams the two LibreOffice engine URLs from these parts with backpressure;
it does not buffer the complete files. The existing browser loader decompresses the gzip data.
Ordinary site assets are served directly without running Worker code. The streaming requests
use the account's Workers request allowance. No paid storage is provisioned.

## Validate and update

```sh
npm run build:cloudflare
npx wrangler deploy --dry-run
npx wrangler dev
```

Verify the homepage, opening a PDF, downloading edits, and a Word-to-PDF conversion.
For a streaming integrity check, compare the SHA-256 of each downloaded `.gz` engine with
its original under `public/libreoffice-wasm`.

The root `wrangler.jsonc` is the website configuration. The other Wrangler files under
`cloudflare/` are upstream proxy examples and are not part of this deployment.
Account credentials stay in Wrangler's local credential store and must not be committed.
