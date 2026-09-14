# PDF.MV workspace improvements — 14 September 2026

Implemented locally from the [UX review](UX-REVIEW-2026-09-14.md). Work was split between two Sol coding agents, one Terra agent, and root integration. No new animation dependency was added.

## Delivered

- **Native Merge:** current PDF becomes the initial source; compact Add files, central lazy page thumbnails, page/file ordering, page selection, keyboard reorder buttons, filename and sticky merge action. Existing CPDF processing is retained, including page labels/font options. Cancellation and failures retain sources. A successful result opens in the main viewer.
- **Central watermark/header-footer previews:** temporary preview replaces the visible canvas while keeping the original viewer intact underneath. Previous/next page, Back to original, input invalidation, cancellation and cleanup are supported. Appearance settings are collapsed initially. Apply remains explicitly **Create edited copy**.
- **File-first conversion:** choose input before format settings; detect common image, office and document formats; mixed images route to the existing image converter. PDF inputs expose output formats. An optional input interpretation override remains available. Unsupported inputs and incompatible batches are rejected before engine selection. Native image controls receive the chosen files automatically; other engines receive them through the existing bridge.
- **State accuracy:** empty tasks no longer inflate Home's document count or appear as ready documents. Source summaries distinguish selected inputs. Empty tasks have a direct picker and do not alone trigger a refresh warning. Result-opening failures propagate instead of producing false success messages.
- **Home:** one collection navigation per viewport, no decorative date, compact upload hero after loading documents, and appearance selection remains available on mobile.
- **Mobile tools:** full-width contextual drawer, named Tools toggle, visible Back to document, Escape dismissal, focus entry/return, focus containment and inert background. Desktop Upload remains 32px; coarse pointers receive a larger target.
- **Recovery:** action, signature and preview panels present readable errors with retry or correction actions and optional technical details. Existing documents/settings remain available.
- **Shared styling:** remaining embedded upload controls use the neutral palette; embedded breadcrumb navigation is suppressed.

## Motion decisions

Document/tab switching, page ordering and keyboard actions stay instant. Occasional pointer-driven mobile drawer transitions provide spatial continuity through opacity and horizontal translation, using the drawer curve `cubic-bezier(0.32, 0.72, 0, 1)` over 220ms. Reduced motion uses 150ms opacity only; keyboard changes remain instant in either preference. No stagger or celebratory motion was added to editing tasks.

## Validation

- Full Vitest run: **961 tests across 59 files passed**.
- TypeScript checking and whitespace/diff checks passed during integration.
- Cloudflare production build and asset preparation passed; SEO validation checked 2,793 HTML files.
- Browser checks with synthetic files: PDF opening; automatic current-document Merge source; two-PDF merge opening a two-page result; PNG detection and conversion opening a PDF; central watermark preview; cancellation restoring the original viewer; mobile drawer focus entry; Escape and focus return; instant keyboard transition.
- The initial merge output check exposed a stale Vite dependency URL. A fresh test session loaded the viewer successfully; error propagation was also corrected so a viewer failure cannot be presented as successful result opening.

## Deliberate limits and next validation

- Other specialized engines continue using existing embedded controls. This change establishes native Merge and shared integration hooks; it does not claim every legacy engine has been rewritten.
- Apply creates an edited copy. Replacing the current document should wait for a reliable cross-tool revision/undo model.
- Office output fidelity, certificate signing, very large documents and real-device gesture behavior require their own acceptance checks. A 390px desktop browser check is not a physical-phone test.
- Files remain session-local. No persistent PDF storage, analytics collection or automatic recovery cache was introduced.
- No production deployment or GitHub merge was performed for this implementation request.
