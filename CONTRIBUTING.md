# Contributing to PDF MV

Start with the setup commands in [README.md](README.md). Fork this repository and create a focused branch from `main`.

## Scope and implementation

Describe the user problem before proposing an implementation. Discuss substantial architecture or dependency changes in an issue first. Keep document data local, preserve independent tab state, and use the shared catalog and theme tokens rather than adding one-off navigation or colors.

Keep changes focused. Do not reformat unrelated files, commit generated builds, or include credentials, personal PDFs, or local environment files. Preserve upstream copyright and dependency notices.

## Validation

Run `npx tsc --noEmit` and relevant tests (`npm run test:run -- path/to/test.ts`). Run the full suite for shared processing or integration changes. Run `npm run build` when changing build configuration or production entry points.

For UI changes, verify light/dark themes, keyboard access, and narrow layouts. For PDF changes, use synthetic fixtures and inspect exported results; a successful download alone does not prove correctness. Verify both Home → tool → file and document → tool flows when applicable.

The commit hook formats staged files and runs ESLint. Review its changes before pushing.

## Pull requests

Explain the problem, resulting behavior, validation performed, and known limitations. Include screenshots for visual changes and reproducible steps for processing fixes. Link related issues. Avoid claiming untested tools or platforms are supported.

## Licensing and conduct

Contributions to PDF MV are under the repository's AGPL-3.0-only license. Only contribute work you have the right to submit. PDF MV does not require the upstream BentoPDF commercial CLA. Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Report vulnerabilities privately using [SECURITY.md](SECURITY.md).
