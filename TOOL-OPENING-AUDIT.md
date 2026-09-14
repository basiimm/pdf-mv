# Current grouped workspace audit

The current Home has **23 task groups**, covering the same **118 engines**. All 23 Home entries passed live app-tab creation and selection checks. Automated routing tests cover every original engine ID and check that selecting a feature inside a task does not create another task.

See [Complete tool and flow review](ALL-TOOLS-REVIEW.md) for all 118 purposes, grouping decisions, workspace placement, processing tests and remaining limits.

The older audit below tested the previous 118-card Home and is retained as historical evidence only.

---

# Home tool opening audit

Checked 14 September 2026: all 118 unique Home tool actions created and selected an in-app tab in a fresh workspace. Each task was closed without uploading documents. All 118 routes also resolve to existing source HTML pages.

An older open workspace instance had 117 external tool anchors, only one tool button, and neither the current tool panel nor its empty-canvas element. That instance predates workspace integration. It was preserved to avoid discarding its open PDF.

Scope: tab creation only. This does not certify file processing, preview rendering, or exports for every engine. One bulk run timed out after reaching WebP to PDF; the audit resumed with SVG to PDF in smaller groups.

## Passed actions

- Edit PDF Text
- PDF Workflow Builder
- PDF Multi Tool
- Merge PDF
- Split PDF
- Compress PDF
- Read & annotate
- JPG to PDF
- Sign PDF
- Crop PDF
- Extract Pages
- Organize & Duplicate
- Delete Pages
- Edit Bookmarks
- Table of Contents
- Page Numbers
- Add Page Labels
- Bates Numbering
- Add Watermark
- Header & Footer
- Invert Colors
- Scanner Effect
- Adjust Colors
- Background Color
- Change Text Color
- Add Stamps
- Remove Annotations
- PDF Form Filler
- Create PDF Form
- Remove Blank Pages
- Images to PDF
- PNG to PDF
- WebP to PDF
- SVG to PDF
- BMP to PDF
- HEIC to PDF
- TIFF to PDF
- Text to PDF
- Markdown to PDF
- JSON to PDF
- ODT to PDF
- CSV to PDF
- RTF to PDF
- Word to PDF
- Excel to PDF
- PowerPoint to PDF
- XPS to PDF
- MOBI to PDF
- EPUB to PDF
- FB2 to PDF
- CBZ to PDF
- WPD to PDF
- WPS to PDF
- XML to PDF
- Pages to PDF
- ODG to PDF
- ODS to PDF
- ODP to PDF
- PUB to PDF
- VSD to PDF
- PSD to PDF
- Email to PDF
- PDF to JPG
- PDF to PNG
- PDF to WebP
- PDF to BMP
- PDF to TIFF
- PDF to CBZ
- PDF to SVG
- PDF to CSV
- PDF to Excel
- PDF to Greyscale
- PDF to JSON
- PDF to Word
- Extract Images
- PDF to Markdown
- Prepare PDF for AI
- PDF to Text
- OCR PDF
- Alternate & Mix Pages
- Duplex Collate
- PDF Overlay
- Add Attachments
- Extract Attachments
- Edit Attachments
- PDF OCG
- Extract Tables
- Divide Pages
- Add Blank Page
- Reverse Pages
- Rotate PDF
- Rotate by Custom Degrees
- N-Up PDF
- PDF Booklet
- Combine to Single Page
- View Metadata
- Edit Metadata
- PDFs to ZIP
- Compare PDFs
- Posterize PDF
- PDF to PDF/A
- Fix Page Size
- Linearize PDF
- Page Dimensions
- Remove Restrictions
- Repair PDF
- Rasterize PDF
- Deskew PDF
- Font to Outline
- Encrypt PDF
- Sanitize PDF
- Decrypt PDF
- Flatten PDF
- Remove Metadata
- Change Permissions
- Digital Signature
- Validate Signature
- Timestamp PDF

## Card click regression — corrected

The previous live checks targeted the small title button. Clicking the card wrapper at the icon position reproduced a dead action for Organize pages. Home cards now use one native button containing the icon, title and description, with no nested button or stretched pseudo-element. The existing workspace passed 23/23 card-area clicks after the change. A regression test checks card, icon, title and description events for every group; the focused catalog/navigation/card suite passes 8 tests, and TypeScript passes.
