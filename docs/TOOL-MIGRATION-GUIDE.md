# Tool migration guide

Goal: every tool runs inside the workspace PDF view. No iframe, no legacy page, no BentoPDF UI. A migrated tool is a `ToolDefinition` rendered by the shared panel.

## Pieces

| Piece    | File                                | Role                                                                                                                     |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Contract | `src/js/tools/types.ts`             | `ToolDefinition`: fields, `primaryLabel`, `doneLabel`, `output`, optional `input`, headless `run()`                      |
| Panel    | `src/js/tools/panel.ts`             | Renders fields (Advanced collapsed), sticky primary action, progress with cancel, result, recoverable errors, undo toast |
| Registry | `src/js/tools/registry.ts`          | `registerTool()`; routing in `workspace-tools.ts` prefers registered tools over iframes                                  |
| Families | `src/js/tools/families/<family>.ts` | One file per family; export `register()`                                                                                 |
| Engines  | `src/js/engines/<tool-id>.ts`       | Pure processing: `(input, options, { signal, progress }) => Promise<File or File[]>`. No DOM queries, no `showAlert`/`showLoader`, no Tailwind strings |
| Kit      | `src/design-system/ui/index.ts`     | All UI. Never hand-build buttons, inputs, alerts or progress                                                             |

## Steps for one tool

1. Read `src/js/logic/<id>-page.ts` and helpers in `src/js/utils/`. Separate processing from DOM code.
2. Move the processing into `src/js/engines/<id>.ts` with typed options. Report real progress where the engine exposes it (pages, files). Check `signal.aborted` between units of work. Throw `Error`s with short, user-safe messages; keep technical detail in the message only when useful for the details section.
3. Make the legacy page call the new engine function, so there is one implementation until the page is deleted.
4. Register a definition in the family file:
   - `output`: `revision` when the result replaces the open PDF (compress, encrypt, flatten, repair…); `new-document` when it creates a separate PDF (conversions to PDF, extract); `download` for non-PDF output (images, Office, text, ZIP).
   - `primaryLabel`: verb first, specific ("Compress PDF", "Export Word document"). `doneLabel`: past tense ("PDF compressed").
   - Fields: sensible defaults so one click works. Only essentials visible; rarely changed options `advanced: true`. Use `select`/`segmented` for ≤5 choices. Page scope key is `pages` (blank = all).
   - `input`: only for tools whose source is not the open PDF (e.g. Word → PDF): `{ accept, multiple, label }`.
5. Add a unit test for the engine's pure parts and the definition (fields, output, labels).
6. Remove the tool id from any legacy special-casing only when the definition fully covers it.

## Rules

- Copy: sentence case, verb-first, name the consequence; errors say what happened, that the document is safe, and one action.
- Password-protected input: throw an error whose message mentions "password" so the panel offers the right recovery; do not open a legacy password modal.
- Heavy engines (Ghostscript, LibreOffice, PyMuPDF, Tesseract): load lazily inside `run()`; report "Loading engine…" as a separate progress phase.
- Never write BentoPDF into output metadata; use PDF.mv.
- `npm run lint:design` must not regress.
