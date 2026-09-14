# PDF MV

<p align="center">
  <img src="public/brand/pdf-mv-logo-animated.svg" alt="PDF MV — animated logo" width="600" height="280" />
</p>

A free, open-source PDF workspace built on [BentoPDF](https://github.com/alam00000/bentopdf). Open a document, make changes, and download a copy. No account or credit card required.

**Status:** active development. The custom workspace is available at `/workspace.html`. This repository does not yet publish an official hosted service, release package, or container image.

## The workspace

- Keep multiple documents open in application tabs.
- Read and annotate PDFs with page thumbnails and a collapsible tool sidebar.
- Find related operations in 23 tool groups, including conversion, page organization, watermarks, headers, signatures, and optimization.
- Choose conversion formats within a shared flow instead of navigating separate tool cards.
- Use light or dark mode with a green accent palette.

Some tools run directly in the viewer; others use embedded BentoPDF interfaces or a dedicated editing canvas. Integration and output quality vary by tool and document. See [tool coverage and limitations](ALL-TOOLS-REVIEW.md).

## Run locally

Install the Node.js version in [`.nvmrc`](.nvmrc), then:

```sh
git clone https://github.com/basiimm/pdf-mv.git
cd pdf-mv
npm ci
npm run dev:local
```

Open **http://127.0.0.1:5173/workspace.html**. The local command binds to loopback and requires port 5173 to be available.

## Development checks

```sh
npx tsc --noEmit
npm run test:run
npm run build
```

The production build outputs `dist/` and includes inherited tool pages and generated documentation/SEO assets. It can take considerably longer than the type check or tests. Use `npm run preview` to inspect the build at `/workspace.html`.

## Architecture

| Area                                  | Entry point                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| Workspace shell and document sessions | `workspace.html`, `src/js/workspace.ts`                                       |
| Grouped tool catalog                  | `src/js/config/workspace-catalog.ts`                                          |
| Tool integration and file handoff     | `src/js/workspace-tools.ts`, `src/js/workspace-tool-bridge.ts`                |
| Native operations and page marks      | `src/js/workspace-actions.ts`, `src/js/workspace-page-marks.ts`               |
| Shared appearance                     | `src/js/studio-theme.ts`, `src/css/studio-theme.css`, `src/css/workspace.css` |
| Processing engines                    | `vendor/`, `src/js/editcore/`, existing BentoPDF tool modules                 |

The application uses TypeScript, Vite, PDF.js, PDF-lib, and browser/WASM processing engines. Viewer and engine updates require checking their source provenance and license notices.

## Privacy and deployment

Normal document processing runs in the browser. Engines, fonts, and other assets may be downloaded on demand. Certificate and timestamp operations can contact external services or a configured proxy; browser-local processing does not mean every feature is offline.

Documents belong to the current browser session. Download results before refreshing or closing it. Large documents and conversions are limited by browser memory and engine support.

A static host can serve the build, but the current deployment configuration and upstream marketing pages need review before a public launch. Verify base paths, worker/WASM assets, security headers, conversion behavior, and source-code access. Upstream container images do not contain the PDF MV workspace.

## Contributing and support

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request. Use [issues](https://github.com/basiimm/pdf-mv/issues) for reproducible bugs and feature requests, and [SECURITY.md](SECURITY.md) for private vulnerability reports. Only share synthetic or sanitized documents.

## License and attribution

PDF MV is a modified BentoPDF distribution under [AGPL-3.0-only](LICENSE), provided without warranty. Original copyright and third-party notices are retained. PDF MV does not offer an upstream commercial license or claim ownership of BentoPDF.

Modifications beginning September 2026 include document tabs, grouped tool flows, viewer integration, theming, and processing fixes. [Full source code](https://github.com/basiimm/pdf-mv) is available here. Dependencies and optional engines retain their own licenses.

The inherited `docs/`, deployment files, and [archived upstream guidance](docs/upstream/README.md) describe BentoPDF unless explicitly identified as PDF MV documentation. They are reference material, not evidence of a supported PDF MV deployment or feature.
