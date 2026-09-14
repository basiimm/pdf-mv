export const preferredTools = [
  'edit-pdf',
  'merge-pdf',
  'split-pdf',
  'compress-pdf',
  'sign-pdf',
  'organize-pdf',
];
export const toolVisuals: Record<string, [string, string, string]> = {
  'edit-pdf': ['pencil-line', '#edf1fc', '#7b8fc3'],
  'merge-pdf': ['combine', '#eff4ef', '#90a48d'],
  'split-pdf': ['scissors', '#faf0eb', '#bc9984'],
  'compress-pdf': ['minimize-2', '#f1edfa', '#a18dc4'],
  'sign-pdf': ['signature', '#f8f3e7', '#b9a574'],
  'organize-pdf': ['layers-2', '#edf4f7', '#83a5b6'],
};
export function inferToolIcon(id: string): string {
  if (/sign/.test(id)) return 'signature';
  if (/encrypt|decrypt|secure|protect|permission|redact/.test(id))
    return 'shield-check';
  if (/image|jpg|png|webp|bmp|tiff|svg|heic/.test(id)) return 'image';
  if (/rotate/.test(id)) return 'rotate-cw';
  if (/crop/.test(id)) return 'crop';
  if (/merge|combine/.test(id)) return 'combine';
  if (/split|extract/.test(id)) return 'scissors';
  if (/delete|remove/.test(id)) return 'eraser';
  if (/text|word|markdown|txt/.test(id)) return 'text-cursor-input';
  if (/page|organize/.test(id)) return 'layers-2';
  if (/compress|optimize/.test(id)) return 'minimize-2';
  return 'file-text';
}
