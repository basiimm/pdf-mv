import { state } from './state.js';

// Observe rendered tool state, so clear/remove operations restore the empty upload view.
const uploader = document.getElementById('tool-uploader');
if (uploader) {
  let lastFiles: File[] = [];
  let initialized = false;
  let generation = 0;
  const previews = document.createElement('div');
  previews.className = 'studio-input-previews';
  previews.setAttribute('aria-label', 'Uploaded document previews');
  if (!document.getElementById('page-merge-preview')) uploader.append(previews);
  const summary = document.createElement('p');
  summary.className = 'studio-file-summary';
  summary.setAttribute('role', 'status');
  const drop = document.getElementById('drop-zone');
  drop?.before(summary);
  drop?.after(previews);
  if (document.getElementById('page-merge-preview')) previews.remove();
  const sync = () => {
    const count = state.files.length;
    if (
      initialized &&
      state.files.length === lastFiles.length &&
      state.files.every((file, i) => file === lastFiles[i])
    )
      return;
    initialized = true;
    lastFiles = [...state.files];
    const version = ++generation;
    previews.replaceChildren();
    previews.hidden = !count;
    if (previews.isConnected && count) {
      // First-page previews only; bounded work avoids opening every large document at once.
      void (async () => {
        for (const file of lastFiles.slice(0, 6)) {
          if (version !== generation) return;
          const card = document.createElement('figure');
          const caption = document.createElement('figcaption');
          caption.textContent = file.name;
          const canvas = document.createElement('canvas');
          canvas.setAttribute('aria-label', `First page of ${file.name}`);
          card.append(canvas, caption);
          previews.append(card);
          try {
            if (!/\.pdf$/i.test(file.name)) {
              canvas.remove();
              continue;
            }
            const pdfjs = await import('pdfjs-dist');
            const pdf = await pdfjs.getDocument({
              data: await file.arrayBuffer(),
            }).promise;
            try {
              if (version !== generation) return;
              const page = await pdf.getPage(1);
              const base = page.getViewport({ scale: 1 });
              const viewport = page.getViewport({ scale: 180 / base.width });
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({
                canvas,
                canvasContext: canvas.getContext('2d')!,
                viewport,
              }).promise;
              caption.textContent = `${file.name} · ${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'}`;
            } finally {
              await pdf.destroy();
            }
          } catch {
            canvas.remove();
            caption.textContent = `${file.name} · Preview unavailable`;
          }
        }
      })();
    }
    uploader.classList.toggle('studio-has-files', count > 0);
    summary.textContent = count
      ? `${count} ${count === 1 ? 'file' : 'files'} in this task`
      : '';
    summary.hidden = !count;
  };
  new MutationObserver(sync).observe(uploader, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden'],
  });
  document.addEventListener('change', () => queueMicrotask(sync));
  sync();
}
