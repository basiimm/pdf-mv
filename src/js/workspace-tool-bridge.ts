const embedded =
  window.parent !== window &&
  new URLSearchParams(location.search).get('workspace') === '1';
if (embedded) {
  document.documentElement.classList.add('workspace-embedded-tool');
  const send = (message: object) =>
    window.parent.postMessage(message, location.origin);
  const primaryInput = () =>
    document.querySelector<HTMLInputElement>('#file-input, input[type="file"]');
  window.addEventListener('message', (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== window.parent ||
      event.data?.type !== 'studio-tool-input' ||
      !(event.data.file instanceof File)
    )
      return;
    const input = document.querySelector<HTMLInputElement>(
      '#file-input, input[type="file"]'
    );
    if (!input) {
      send({
        type: 'studio-tool-error',
        message:
          'This tool has no file input. Use its controls to create a document.',
      });
      return;
    }
    const transfer = new DataTransfer();
    const files =
      Array.isArray(event.data.files) &&
      event.data.files.every((file: unknown) => file instanceof File)
        ? (event.data.files as File[])
        : [event.data.file];
    for (const file of input.multiple ? files : files.slice(0, 1))
      transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    send({ type: 'studio-tool-input-received' });
  });
  document.addEventListener('change', (event) => {
    if (
      event.target instanceof HTMLInputElement &&
      event.target.type === 'file' &&
      event.target === primaryInput() &&
      event.target.files?.[0]
    )
      send({ type: 'studio-tool-source', file: event.target.files[0] });
  });
  document.addEventListener('drop', (event) => {
    if (event.dataTransfer?.files[0])
      send({ type: 'studio-tool-source', file: event.dataTransfer.files[0] });
  });
  document.addEventListener(
    'click',
    async (event) => {
      const anchor = event
        .composedPath()
        .find((node) => node instanceof HTMLAnchorElement) as
        | HTMLAnchorElement
        | undefined;
      if (!anchor?.download || !anchor.href.startsWith('blob:')) return;
      event.preventDefault();
      try {
        send({
          type: 'studio-tool-output',
          blob: await (await fetch(anchor.href)).blob(),
          name: anchor.download,
        });
      } catch {
        send({
          type: 'studio-tool-error',
          message:
            'The tool could not return its export. Keep the task open and retry.',
        });
      }
    },
    true
  );
  let readySent = false;
  const ready = () => {
    if (readySent) return;
    const needsExplicitReady = /\/(ocr-pdf|json-to-pdf)\.html$/.test(
      location.pathname
    );
    if (
      needsExplicitReady &&
      document.documentElement.dataset.workspaceInputReady !== 'true'
    )
      return;
    readySent = true;
    send({ type: 'studio-tool-ready' });
  };
  window.addEventListener('studio-input-ready', ready);
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready, { once: true });
  window.addEventListener('unhandledrejection', () =>
    send({
      type: 'studio-tool-error',
      message:
        'The tool encountered an error. Check its message below or retry with the current PDF.',
    })
  );
  window.addEventListener('error', () =>
    send({
      type: 'studio-tool-error',
      message: 'A tool component failed to load. Try reopening this tool.',
    })
  );
}
