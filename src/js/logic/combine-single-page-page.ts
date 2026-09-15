import { showLoader, hideLoader, showAlert } from '../ui.js';
import { downloadFile, formatBytes } from '../utils/helpers.js';
import { createIcons, icons } from 'lucide';
import { CombineSinglePageState } from '@/types';
import { loadPdfWithPasswordPrompt } from '../utils/password-prompt.js';
import { loadPdfDocument } from '../utils/load-pdf-document.js';
import {
  combineSinglePage,
  CombineOrientation,
} from '../engines/combine-single-page.js';
import '../utils/setup-pdf-worker.js';

const pageState: CombineSinglePageState = {
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

async function combineToSinglePage() {
  if (!pageState.pdfDoc || !pageState.file) {
    showAlert('Error', 'Please upload a PDF first.');
    return;
  }

  const orientation = (
    document.getElementById('combine-orientation') as HTMLSelectElement
  ).value;
  const spacing =
    parseInt(
      (document.getElementById('page-spacing') as HTMLInputElement).value
    ) || 0;
  const backgroundColorHex = (
    document.getElementById('background-color') as HTMLInputElement
  ).value;
  const addSeparator = (
    document.getElementById('add-separator') as HTMLInputElement
  ).checked;
  const separatorThickness =
    parseFloat(
      (document.getElementById('separator-thickness') as HTMLInputElement).value
    ) || 0.5;
  const separatorColorHex = (
    document.getElementById('separator-color') as HTMLInputElement
  ).value;

  showLoader('Combining pages...');

  try {
    const sourceBytes = await pageState.pdfDoc.save();
    const resultFile = await combineSinglePage(
      new File([new Uint8Array(sourceBytes)], pageState.file.name, {
        type: 'application/pdf',
      }),
      {
        orientation: orientation as CombineOrientation,
        spacing,
        backgroundColor: backgroundColorHex,
        addSeparator,
        separatorThickness,
        separatorColor: separatorColorHex,
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
      'Pages combined successfully!',
      'success',
      function () {
        resetState();
      }
    );
  } catch (e) {
    console.error(e);
    showAlert('Error', 'An error occurred while combining pages.');
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
  const addSeparatorCheckbox = document.getElementById('add-separator');
  const separatorOptions = document.getElementById('separator-options');

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      window.location.href = import.meta.env.BASE_URL;
    });
  }

  if (addSeparatorCheckbox && separatorOptions) {
    addSeparatorCheckbox.addEventListener('change', function () {
      if ((addSeparatorCheckbox as HTMLInputElement).checked) {
        separatorOptions.classList.remove('hidden');
      } else {
        separatorOptions.classList.add('hidden');
      }
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
    processBtn.addEventListener('click', combineToSinglePage);
  }
});
