import { showLoader, hideLoader, showAlert } from '../ui.js';
import { downloadFile, formatBytes } from '../utils/helpers.js';
import { createIcons, icons } from 'lucide';
import { PDFDocument as PDFLibDocument, PageSizes } from 'pdf-lib';
import { loadPdfWithPasswordPrompt } from '../utils/password-prompt.js';
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import { nUpPdf, NUpPagesPerSheet } from '../engines/n-up-pdf.js';

interface NUpState {
  file: File | null;
  pdfDoc: PDFLibDocument | null;
}

const pageState: NUpState = {
  file: null,
  pdfDoc: null,
};

function resetState() {
  pageState.file = null;
  pageState.pdfDoc = null;

  const fileDisplayArea = document.getElementById('file-display-area');
  if (fileDisplayArea) fileDisplayArea.innerHTML = '';

  const toolOptions = document.getElementById('tool-options');
  if (toolOptions) toolOptions.classList.add('hidden');

  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  if (fileInput) fileInput.value = '';
}

async function updateUI() {
  const fileDisplayArea = document.getElementById('file-display-area');
  const toolOptions = document.getElementById('tool-options');

  if (!fileDisplayArea) return;

  fileDisplayArea.innerHTML = '';

  if (pageState.file) {
    const fileDiv = document.createElement('div');
    fileDiv.className =
      'flex items-center justify-between bg-gray-700 p-3 rounded-lg text-sm';

    const infoContainer = document.createElement('div');
    infoContainer.className = 'flex flex-col overflow-hidden';

    const nameSpan = document.createElement('div');
    nameSpan.className = 'truncate font-medium text-gray-200 text-sm mb-1';
    nameSpan.textContent = pageState.file.name;

    const metaSpan = document.createElement('div');
    metaSpan.className = 'text-xs text-gray-400';
    metaSpan.textContent = `${formatBytes(pageState.file.size)} • Loading...`;

    infoContainer.append(nameSpan, metaSpan);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ml-4 text-red-400 hover:text-red-300 flex-shrink-0';
    removeBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
    removeBtn.onclick = function () {
      resetState();
    };

    fileDiv.append(infoContainer, removeBtn);
    fileDisplayArea.appendChild(fileDiv);
    createIcons({ icons });

    try {
      const result = await loadPdfWithPasswordPrompt(pageState.file);
      if (!result) {
        resetState();
        return;
      }
      showLoader('Loading PDF...');
      result.pdf.destroy();
      pageState.file = result.file;
      pageState.pdfDoc = await loadPdfDocument(result.bytes);
      hideLoader();

      const pageCount = pageState.pdfDoc.getPageCount();
      metaSpan.textContent = `${formatBytes(pageState.file.size)} • ${pageCount} pages`;

      if (toolOptions) toolOptions.classList.remove('hidden');
    } catch (error) {
      console.error('Error loading PDF:', error);
      hideLoader();
      showAlert('Error', 'Failed to load PDF file.');
      resetState();
    }
  } else {
    if (toolOptions) toolOptions.classList.add('hidden');
  }
}

async function nUpTool() {
  if (!pageState.pdfDoc || !pageState.file) {
    showAlert('Error', 'Please upload a PDF first.');
    return;
  }

  const n = parseInt(
    (document.getElementById('pages-per-sheet') as HTMLSelectElement).value
  ) as NUpPagesPerSheet;
  const pageSizeKey = (
    document.getElementById('output-page-size') as HTMLSelectElement
  ).value as keyof typeof PageSizes;
  const orientation = (
    document.getElementById('output-orientation') as HTMLSelectElement
  ).value;
  const useMargins = (
    document.getElementById('add-margins') as HTMLInputElement
  ).checked;
  const addBorder = (document.getElementById('add-border') as HTMLInputElement)
    .checked;
  const borderColorHex = (
    document.getElementById('border-color') as HTMLInputElement
  ).value;

  showLoader('Creating N-Up PDF...');

  try {
    const sourceBytes = await pageState.pdfDoc.save();
    const resultFile = await nUpPdf(
      new File([new Uint8Array(sourceBytes)], pageState.file.name, {
        type: 'application/pdf',
      }),
      {
        pagesPerSheet: n,
        pageSize: pageSizeKey,
        orientation: orientation as 'auto' | 'portrait' | 'landscape',
        margins: useMargins,
        border: addBorder,
        borderColor: borderColorHex,
      },
      {
        signal: new AbortController().signal,
        progress: (p) => showLoader(p.label),
      }
    );

    const newPdfBytes = await resultFile.arrayBuffer();
    downloadFile(
      new Blob([new Uint8Array(newPdfBytes)], { type: 'application/pdf' }),
      pageState.file.name
    );

    showAlert(
      'Success',
      'N-Up PDF created successfully!',
      'success',
      function () {
        resetState();
      }
    );
  } catch (e) {
    console.error(e);
    showAlert('Error', 'An error occurred while creating the N-Up PDF.');
  } finally {
    hideLoader();
  }
}

function handleFileSelect(files: FileList | null) {
  if (files && files.length > 0) {
    const file = files[0];
    if (
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf')
    ) {
      pageState.file = file;
      updateUI();
    }
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const dropZone = document.getElementById('drop-zone');
  const processBtn = document.getElementById('process-btn');
  const backBtn = document.getElementById('back-to-tools');
  const addBorderCheckbox = document.getElementById('add-border');
  const borderColorWrapper = document.getElementById('border-color-wrapper');

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      window.location.href = import.meta.env.BASE_URL;
    });
  }

  if (addBorderCheckbox && borderColorWrapper) {
    addBorderCheckbox.addEventListener('change', function () {
      borderColorWrapper.classList.toggle(
        'hidden',
        !(addBorderCheckbox as HTMLInputElement).checked
      );
    });
  }

  if (fileInput && dropZone) {
    fileInput.addEventListener('change', function (e) {
      handleFileSelect((e.target as HTMLInputElement).files);
    });

    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropZone.classList.add('bg-gray-700');
    });

    dropZone.addEventListener('dragleave', function (e) {
      e.preventDefault();
      dropZone.classList.remove('bg-gray-700');
    });

    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('bg-gray-700');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const pdfFiles = Array.from(files).filter(function (f) {
          return (
            f.type === 'application/pdf' ||
            f.name.toLowerCase().endsWith('.pdf')
          );
        });
        if (pdfFiles.length > 0) {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(pdfFiles[0]);
          handleFileSelect(dataTransfer.files);
        }
      }
    });

    fileInput.addEventListener('click', function () {
      fileInput.value = '';
    });
  }

  if (processBtn) {
    processBtn.addEventListener('click', nUpTool);
  }
});
