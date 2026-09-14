import type { ToolHost } from './workspace-tools.js';

let signatureFont: Promise<FontFace> | undefined;
function loadSignatureFont() {
  return (signatureFont ??= new FontFace(
    'Momo Signature',
    `url("${import.meta.env.BASE_URL}fonts/MomoSignature-Regular.ttf")`
  )
    .load()
    .then((font) => {
      document.fonts.add(font);
      return font;
    })
    .catch((error) => {
      signatureFont = undefined;
      throw error;
    }));
}

/** Signature artwork stays in its document session, never in persistent storage. */
export function createSignaturePanel(
  host: ToolHost,
  id: string,
  refresh: () => void
) {
  const root = document.createElement('div');
  root.className = 'native-mark-panel signature-panel';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const intro = document.createElement('p');
  intro.textContent =
    'Create your signature, then click a page to place it. You can move and resize it before downloading.';
  const pdf = document.createElement('input');
  pdf.type = 'file';
  pdf.accept = '.pdf,application/pdf';
  pdf.hidden = true;
  const open = button('Open PDF', () => {
    pdf.value = '';
    pdf.click();
  });
  open.classList.add('button-primary');
  const form = document.createElement('div');
  const modes = document.createElement('div');
  modes.className = 'signature-modes';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', 'Create signature');
  let mode = 'draw',
    drawing = false,
    hasInk = false,
    image: HTMLImageElement | null = null;
  let ink = '#171717';
  const strokes: [number, number][][] = [];
  let activePointer: number | null = null;
  const drawControls = document.createElement('div');
  drawControls.className = 'signature-draw-controls';
  const palette = document.createElement('div');
  palette.className = 'signature-colors';
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', 'Signature ink color');
  for (const [label, color] of [
    ['Black', '#171717'],
    ['Cobalt blue', '#0047ab'],
    ['Green', '#16733b'],
    ['Red', '#c62828'],
    ['Pink', '#c21875'],
  ]) {
    const swatch = button(label, () => {
      ink = color;
      for (const child of Array.from(palette.children))
        child.setAttribute('aria-pressed', String(child === swatch));
      render();
    });
    swatch.className = 'signature-swatch';
    swatch.title = label;
    swatch.setAttribute('aria-label', label);
    swatch.setAttribute('aria-pressed', String(color === ink));
    swatch.style.setProperty('--ink', color);
    palette.append(swatch);
  }
  const smoothingLabel = document.createElement('label');
  smoothingLabel.className = 'signature-smoothing';
  const smoothingText = document.createElement('span');
  smoothingText.textContent = 'Smoothing: Gentle';
  const smoothing = document.createElement('input');
  smoothing.type = 'range';
  smoothing.min = '0';
  smoothing.max = '3';
  smoothing.step = '1';
  smoothing.value = '1';
  smoothing.setAttribute('aria-label', 'Signature smoothing');
  smoothing.setAttribute('aria-valuetext', 'Gentle');
  smoothing.oninput = () => {
    const value = ['Off', 'Gentle', 'Medium', 'Strong'][
      Number(smoothing.value)
    ];
    smoothingText.textContent = `Smoothing: ${value}`;
    smoothing.setAttribute('aria-valuetext', value);
    render();
  };
  smoothingLabel.append(smoothingText, smoothing);
  drawControls.append(palette, smoothingLabel);
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 300;
  canvas.className = 'signature-pad';
  canvas.setAttribute(
    'aria-label',
    'Draw your signature. Use Type or Upload as an alternative.'
  );
  const name = document.createElement('input');
  name.type = 'text';
  name.maxLength = 80;
  name.placeholder = 'Your name';
  name.setAttribute('aria-label', 'Signature text');
  const upload = document.createElement('input');
  upload.type = 'file';
  upload.accept = 'image/png,image/jpeg,image/webp';
  upload.hidden = true;
  const uploadButton = button('Upload signature image', () => {
    upload.value = '';
    upload.click();
  });
  const clear = button('Clear signature', () => {
    host.cancelSignature(id);
    image = null;
    name.value = '';
    renderVersion++;
    hasInk = false;
    drawing = false;
    activePointer = null;
    strokes.length = 0;
    canvas.getContext('2d')?.clearRect(0, 0, 800, 300);
    place.disabled = true;
    status.textContent = '';
  });
  const place = button('Place signature', async () => {
    if (!host.hasPdf(id)) return;
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Signature canvas is unavailable.');
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let left = canvas.width,
        top = canvas.height,
        right = -1,
        bottom = -1;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          if (pixels.data[(y * canvas.width + x) * 4 + 3] > 0) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      if (right < left)
        throw new Error('Draw, type or upload a signature first.');
      const cropped = document.createElement('canvas');
      cropped.width = right - left + 9;
      cropped.height = bottom - top + 9;
      cropped
        .getContext('2d')!
        .drawImage(
          canvas,
          left,
          top,
          right - left + 1,
          bottom - top + 1,
          4,
          4,
          right - left + 1,
          bottom - top + 1
        );
      const width = Math.min(180, (72 * cropped.width) / cropped.height);
      // This viewer's stamp engine uses image pixel dimensions for its appearance.
      // Match the source raster to its initial page size to avoid a clipped export.
      const placed = document.createElement('canvas');
      placed.width = Math.round(width);
      placed.height = Math.max(
        1,
        Math.round((width * cropped.height) / cropped.width)
      );
      placed
        .getContext('2d')!
        .drawImage(cropped, 0, 0, placed.width, placed.height);
      await host.placeSignature(id, placed.toDataURL('image/png'), {
        width: placed.width,
        height: placed.height,
      });
      status.textContent =
        'Click the document to place your signature. Use the viewer to move, resize or undo it.';
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'Could not place signature.';
    }
  });
  place.classList.add('button-primary');
  place.disabled = true;
  function button(text: string, action: () => void) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'button';
    b.textContent = text;
    b.onclick = action;
    return b;
  }
  let renderVersion = 0;
  async function render() {
    const version = ++renderVersion;
    host.cancelSignature(id);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 800, 300);
    if (mode === 'draw') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const raw of strokes) {
        // Always smooth original points, so adjustments never compound or erase ink.
        let points = raw;
        const amount = Number(smoothing.value) * 0.15;
        for (let pass = 0; pass < 2 && amount > 0; pass++) {
          const previous = points;
          points = previous.map((p, i) => {
            if (i === 0 || i === previous.length - 1) return p;
            return [
              p[0] * (1 - amount) +
                ((previous[i - 1][0] + previous[i + 1][0]) * amount) / 2,
              p[1] * (1 - amount) +
                ((previous[i - 1][1] + previous[i + 1][1]) * amount) / 2,
            ];
          });
        }
        ctx.beginPath();
        ctx.moveTo(...points[0]);
        if (points.length === 1) ctx.lineTo(points[0][0] + 0.1, points[0][1]);
        else for (const p of points.slice(1)) ctx.lineTo(...p);
        ctx.stroke();
      }
    } else if (mode === 'type' && name.value.trim()) {
      place.disabled = true;
      status.textContent = 'Loading signature font…';
      try {
        await loadSignatureFont();
      } catch {
        if (version === renderVersion)
          status.textContent =
            'Could not load the signature font. Try typing again.';
        return;
      }
      if (version !== renderVersion) return;
      status.textContent = '';
      ctx.fillStyle = '#171717';
      ctx.font = '100px "Momo Signature"';
      const size = Math.min(
        100,
        (100 * 720) / Math.max(1, ctx.measureText(name.value).width)
      );
      ctx.font = `${size}px "Momo Signature"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.value, 400, 150);
    } else if (mode === 'upload' && image) {
      const scale = Math.min(
        760 / image.naturalWidth,
        260 / image.naturalHeight
      );
      const w = image.naturalWidth * scale,
        h = image.naturalHeight * scale;
      ctx.drawImage(image, (800 - w) / 2, (300 - h) / 2, w, h);
    }
    place.disabled = !(mode === 'type'
      ? name.value.trim()
      : mode === 'upload'
        ? image
        : hasInk);
  }
  for (const value of ['draw', 'type', 'upload']) {
    const b = button(value[0].toUpperCase() + value.slice(1), () => {
      if (mode === value) return;
      mode = value;
      drawing = false;
      activePointer = null;
      hasInk = strokes.length > 0;
      drawControls.hidden = mode !== 'draw';
      status.textContent = '';
      host.cancelSignature(id);
      for (const child of Array.from(modes.children))
        child.setAttribute('aria-pressed', String(child === b));
      name.hidden = mode !== 'type';
      uploadButton.hidden = mode !== 'upload';
      canvas.style.cursor = mode === 'draw' ? 'crosshair' : 'default';
      render();
    });
    b.setAttribute('aria-pressed', String(value === mode));
    modes.append(b);
  }
  name.hidden = true;
  uploadButton.hidden = true;
  name.oninput = render;
  const point = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * 800) / r.width,
      ((e.clientY - r.top) * 300) / r.height,
    ];
  };
  canvas.onpointerdown = (e) => {
    if (mode !== 'draw' || activePointer !== null || e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    activePointer = e.pointerId;
    drawing = true;
    hasInk = true;
    strokes.push([point(e)]);
    render();
  };
  canvas.onpointermove = (e) => {
    if (!drawing || e.pointerId !== activePointer) return;
    const samples = e.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [e])
      strokes[strokes.length - 1].push(point(sample));
    render();
  };
  canvas.onpointerup =
    canvas.onpointercancel =
    canvas.onlostpointercapture =
      (e) => {
        if (e.pointerId !== activePointer) return;
        drawing = false;
        activePointer = null;
      };
  upload.onchange = async () => {
    const file = upload.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      status.textContent = 'Choose an image under 10 MB.';
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      img.src = url;
      await img.decode();
      image = img;
      render();
      status.textContent =
        'Image ready. Transparent PNG gives the cleanest result.';
    } catch {
      status.textContent = 'Could not read this image. Try PNG, JPEG or WebP.';
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  pdf.onchange = async () => {
    const file = pdf.files?.[0];
    if (!file) return;
    try {
      open.disabled = true;
      await host.attach(id, file);
      sync();
      refresh();
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'Could not open PDF.';
    } finally {
      open.disabled = false;
    }
  };
  const note = document.createElement('p');
  note.textContent =
    'This adds a visible signature. For certificate-based signing, choose Digital Signature PDF above.';
  form.append(
    modes,
    name,
    uploadButton,
    upload,
    drawControls,
    canvas,
    clear,
    place,
    note
  );
  root.append(intro, open, pdf, form, status);
  let wasVisible = true;
  function sync() {
    open.hidden = host.hasPdf(id);
    form.hidden = !host.hasPdf(id);
    const visible = !root.hidden;
    if (!visible && wasVisible) host.cancelSignature(id);
    wasVisible = visible;
  }
  sync();
  return {
    root,
    sync,
    dispose() {
      renderVersion++;
      host.cancelSignature(id);
      image = null;
      root.remove();
    },
  };
}
