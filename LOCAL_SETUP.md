> Development record from September 2026. Entries describe checks and decisions at the time; later entries may supersede earlier findings. For current setup and scope, start with [README.md](README.md).

# Local workspace setup

Based on BentoPDF v2.8.8, commit `f96cd4e5166f3d51393dfe9f3c440b5bb77802f1`.
Local branch: `workspace-setup`. Upstream source and notices are preserved.

## Run

From this `app` directory, use Node 24.3.0 (the tested version, recorded in `.nvmrc`):

```sh
npm ci
npm run dev:local
```

Open http://127.0.0.1:5173/workspace.html. The upstream tool library remains at `/simple-index.html`. The local command binds only to loopback, uses port 5173 without silently switching ports, and disables the GitHub star counter. No account, database, server-side document processing, or hosting subscription is configured.

## Verify

```sh
npm run test:run
SIMPLE_MODE=true DISABLE_GITHUB_STARS=true npm run build
```

Do not build while editing documents in the development browser: generated source/public files can trigger a full Vite reload and discard in-memory work.

## Baseline observed on 14 September 2026

- Locked dependency installation succeeded: 1,009 packages. No dependency upgrades were performed.
- TypeScript/production build succeeded; upstream SEO audit passed 2,772 generated HTML files. Existing dependency eval and chunk-size warnings remain.
- Initial tests: 911 passing, two suites could not load WASM from a path containing spaces. Fixed `src/js/editcore/engine-loader.js` to decode the file URL pathname before passing it to the Node WASM loader.
- After fix: all 48 test files and 923 tests passed.
- Existing-text editor opened the upstream synthetic sample PDF. Replaced its title with “Edited PDF” and exported. Independent PDF.js extraction found the replacement title (with extra extraction whitespace) and the remaining document text. This is a smoke check, not a comprehensive visual-fidelity benchmark.
- Merge: loaded two one-page synthetic PDFs and received the tool's success message. Downloaded output was not independently inspected, so full merge/export verification remains open.
- Annotation editor: loaded two PDFs in native viewer tabs and switched to the second; annotation controls were available. Independent edited exports and undo isolation remain to be tested.
- Word conversion: loaded a synthetic DOCX and initialized LibreOffice from local assets, but conversion remained on Processing during the bounded browser check. Aborted by navigation. Not counted as passing; diagnose browser/engine compatibility and repeat with a fuller Office fixture.
- Image conversion and OCR were not browser-tested in this pass.

## Integration map

- `src/js/main.ts` builds Home tool links; the application currently uses separate HTML tool pages.
- `src/js/state.ts` holds singleton tool state and cannot simply become shared state for every document tab.
- `src/js/logic/edit-pdf-page.ts` initializes the vendored viewer, which already supports multiple documents. Its current outer download filename tracks the first uploaded file; fix active-document naming during tab integration.
- `src/js/logic/edit-pdf-text-page.ts` and `src/js/editcore/` drive the separate existing-content editor. It needs an explicit document/session boundary before joining the same workspace.
- `src/js/logic/merge-pdf-page.ts` is the page-level merge entry point.
- `src/js/utils/libreoffice-loader.ts` loads browser conversion assets. The compressed data/WASM files total roughly 74 MB; lazy loading is essential.

## Engine provenance

`vendor/bentopdf-viewer/.upstream-version` pins `8ff5002c6cd5`. The app's update workflow identifies https://github.com/alam00000/bentopdf-pdfium-viewer as the source fork and packs its published JS/WASM into local archives. The installed viewer package reports 2.9.1/MIT, while the fork's current root describes AGPL contributions plus retained MIT code. Preserve all notices and inspect the exact pinned source/license before redistribution. Full WASM-from-source reproducibility has not been verified.

## Next milestone

The custom UI entry is `workspace.html`, included in the Vite production inputs. It uses the viewer's document manager for a persistent Home and PDF tabs. First prove edits, undo, active-document download naming, close behavior, and switching isolation on two documents. Keep the existing text editor and conversion failures explicit until their integration passes. No public deployment has been performed.

## Hosting direction

Supabase is not required for the current app: there is no account or database dependency. Deploy the production static assets on a host that supports the existing COOP/COEP headers and WASM assets. The new UI entry is `/workspace.html`; changing the public root route is a release configuration step. AI features or cross-device saved documents would need a separate backend design later.

## Custom workspace validation

- Full production build and SEO audit passed (2,793 HTML files). TypeScript check and four session tests pass (duplicate filenames, Home retention, adjacent/last close, edit revisions during export, import cleanliness).
- Browser: opened two different PDFs; Home retained both; tool search filtered merge tools; the second PDF retained 80% zoom while the first retained its own zoom.
- Created a text annotation on the second document; only its tab became dirty. Close prompted to keep/download/discard; Keep working retained the tab. Switched documents, returned, and Undo removed the annotation. Closing both returned to Home.
- Active-document export reported `Downloaded second.pdf`. Browser download initiation was observed; the resulting file was not available for independent inspection in this pass.
- Native annotation toolbar remains in use. Merge, conversions, and existing-text editing open the upstream tool pages in separate tabs. Full integration, Office conversion diagnosis, and custom-font export fidelity remain follow-up work.
