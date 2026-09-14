// Pure engine for the Update layer visibility tool (OCG / optional content).
// See docs/TOOL-MIGRATION-GUIDE.md.
//
// The legacy page (src/js/logic/pdf-layers-page.ts) loaded PyMuPDF (WASM) to
// add/remove/reorder layers in a tree editor. That editing UI doesn't fit
// the shared panel's static-field contract, so this engine only covers what
// the panel *can* express well: toggling each existing layer's default
// visibility via dynamic checkbox fields. Adding, deleting, and nesting
// layers is dropped — pdf-lib's low-level object model reads and writes the
// OCG default configuration (/OCProperties /D /ON /OFF) directly, so no
// PyMuPDF/WASM load is needed for this narrower scope.
import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFString,
} from 'pdf-lib';
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import type { ToolField } from '../tools/types.js';

/** Dynamic field keys are namespaced so they never collide with static fields. */
const LAYER_KEY_PREFIX = 'layer:';

function refKey(ref: PDFRef): string {
  return `${LAYER_KEY_PREFIX}${ref.objectNumber}_${ref.generationNumber}`;
}

function decodeName(value: unknown, fallback: string): string {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return value.decodeText() || fallback;
  }
  return fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ocProperties(pdfDoc: any): PDFDict | undefined {
  const dict = pdfDoc.catalog.lookup(PDFName.of('OCProperties'));
  return dict instanceof PDFDict ? dict : undefined;
}

export interface PdfLayerField {
  ref: PDFRef;
  name: string;
  visible: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readLayers(pdfDoc: any): PdfLayerField[] {
  const ocp = ocProperties(pdfDoc);
  if (!ocp) return [];

  const ocgs = ocp.lookup(PDFName.of('OCGs'));
  if (!(ocgs instanceof PDFArray)) return [];

  const defaultConfig = ocp.lookup(PDFName.of('D'));
  const offRefs = new Set<string>();
  if (defaultConfig instanceof PDFDict) {
    const off = defaultConfig.lookup(PDFName.of('OFF'));
    if (off instanceof PDFArray) {
      for (const entry of off.asArray()) {
        if (entry instanceof PDFRef) offRefs.add(entry.toString());
      }
    }
  }

  const layers: PdfLayerField[] = [];
  for (const entry of ocgs.asArray()) {
    if (!(entry instanceof PDFRef)) continue;
    const ocgDict = pdfDoc.context.lookup(entry);
    if (!(ocgDict instanceof PDFDict)) continue;
    const name = decodeName(
      ocgDict.get(PDFName.of('Name')),
      `Layer ${layers.length + 1}`
    );
    layers.push({ ref: entry, name, visible: !offRefs.has(entry.toString()) });
  }
  return layers;
}

export interface PdfLayersInspection {
  fields: ToolField[];
  values: Record<string, string>;
  details: [label: string, value: string][];
}

export async function inspectPdfLayers(
  file: File
): Promise<PdfLayersInspection> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(bytes);
  const layers = readLayers(pdfDoc);

  if (layers.length === 0) {
    return { fields: [], values: {}, details: [['Layers', 'None found']] };
  }

  const fields: ToolField[] = layers.map((layer) => ({
    key: refKey(layer.ref),
    label: layer.name,
    value: '',
    type: 'checkbox',
  }));
  const values: Record<string, string> = {};
  for (const layer of layers) {
    values[refKey(layer.ref)] = layer.visible ? 'true' : 'false';
  }

  return {
    fields,
    values,
    details: [['Layers', `${layers.length} layers`]],
  };
}

export interface PdfLayersOptions {
  [key: string]: string | undefined;
}

export async function updatePdfLayers(
  file: File,
  options: PdfLayersOptions,
  ctx: {
    signal: AbortSignal;
    progress(p: { label: string; value?: number; detail?: string }): void;
  }
): Promise<File> {
  if (ctx.signal.aborted) throw new Error('Cancelled');

  ctx.progress({ label: 'Updating layer visibility…' });
  const bytes = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(bytes);
  const layers = readLayers(pdfDoc);
  if (layers.length === 0) {
    throw new Error('This document has no layers to update.');
  }

  const ocp = ocProperties(pdfDoc);
  if (!ocp) throw new Error('This document has no layers to update.');
  const existingConfig = ocp.lookup(PDFName.of('D'));
  const defaultConfig =
    existingConfig instanceof PDFDict ? existingConfig : pdfDoc.context.obj({});
  if (defaultConfig !== existingConfig) {
    ocp.set(PDFName.of('D'), defaultConfig);
  }

  const onArray = pdfDoc.context.obj([]) as PDFArray;
  const offArray = pdfDoc.context.obj([]) as PDFArray;

  for (const layer of layers) {
    const key = refKey(layer.ref);
    const requestedVisible =
      key in options ? options[key] === 'true' : layer.visible;
    (requestedVisible ? onArray : offArray).push(layer.ref);
  }

  defaultConfig.set(PDFName.of('ON'), onArray);
  defaultConfig.set(PDFName.of('OFF'), offArray);

  const outBytes = await pdfDoc.save();
  return new File([new Uint8Array(outBytes)], file.name, {
    type: 'application/pdf',
  });
}
