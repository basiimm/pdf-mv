import { showLoader, hideLoader, showAlert } from '../ui.js';
import { downloadFile, formatBytes } from '../utils/helpers.js';
import { createIcons, icons } from 'lucide';
import { convertBmpToPdf } from '../engines/images-to-pdf.js';

let files: File[] = [];

const updateUI = () => {
  const fileDisplayArea = document.getElementById('file-display-area');
  const fileControls = document.getElementById('file-controls');
  const processBtn = document.getElementById('process-btn');

  if (!fileDisplayArea || !fileControls || !processBtn) return;

  fileDisplayArea.innerHTML = '';

  if (files.length > 0) {
    fileControls.classList.remove('hidden');
    processBtn.classList.remove('hidden');

    files.forEach((file, index) => {
      const fileDiv = document.createElement('div');
      fileDiv.className =
        'flex items-center justify-between bg-gray-700 p-3 rounded-lg text-sm';

      const infoContainer = document.createElement('div');
      infoContainer.className = 'flex items-center gap-2 overflow-hidden';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'truncate font-medium text-gray-200';
      nameSpan.textContent = file.name;

      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'flex-shrink-0 text-gray-400 text-xs';
      sizeSpan.textContent = `(${formatBytes(file.size)})`;

      infoContainer.append(nameSpan, sizeSpan);

      const removeBtn = document.createElement('button');
      removeBtn.className =
        'ml-4 text-red-400 hover:text-red-300 flex-shrink-0';
      removeBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
      removeBtn.onclick = () => {
        files = files.filter((_, i) => i !== index);
        updateUI();
      };

      fileDiv.append(infoContainer, removeBtn);
      fileDisplayArea.appendChild(fileDiv);
    });
    createIcons({ icons });
  } else {
    fileControls.classList.add('hidden');
    processBtn.classList.add('hidden');
  }
};

const resetState = () => {
  files = [];
  updateUI();
};

async function convert() {
  if (files.length === 0) {
    showAlert('No Files', 'Please select at least one BMP file.');
    return;
  }
  showLoader('Converting BMP to PDF...');
  try {
    const controller = new AbortController();
    const pdfFile = await convertBmpToPdf(files, {
      signal: controller.signal,
      progress: (p) =>
        showLoader(p.detail ? `${p.label}: ${p.detail}` : p.label),
    });
    downloadFile(pdfFile, pdfFile.name);
    showAlert('Success', 'PDF created successfully!', 'success', () => {
      resetState();
    });
  } catch (e) {
    console.error(e);
    showAlert(
      'Error',
      'Failed to convert BMP to PDF. One of the files may be invalid.'
    );
  } finally {
    hideLoader();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const dropZone = document.getElementById('drop-zone');
  const addMoreBtn = document.getElementById('add-more-btn');
  const clearFilesBtn = document.getElementById('clear-files-btn');
  const processBtn = document.getElementById('process-btn');
  const backBtn = document.getElementById('back-to-tools');

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = import.meta.env.BASE_URL;
    });
  }

  const handleFileSelect = (newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;
    const validFiles = Array.from(newFiles).filter(
      (file) =>
        file.type === 'image/bmp' || file.name.toLowerCase().endsWith('.bmp')
    );

    if (validFiles.length < newFiles.length) {
      showAlert(
        'Invalid Files',
        'Some files were skipped. Only BMP files are allowed.'
      );
    }

    if (validFiles.length > 0) {
      files = [...files, ...validFiles];
      updateUI();
    }
  };

  if (fileInput && dropZone) {
    fileInput.addEventListener('change', (e) => {
      handleFileSelect((e.target as HTMLInputElement).files);
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('bg-gray-700');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('bg-gray-700');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('bg-gray-700');
      handleFileSelect(e.dataTransfer?.files ?? null);
    });

    fileInput.addEventListener('click', () => {
      fileInput.value = '';
    });
  }

  if (addMoreBtn) {
    addMoreBtn.addEventListener('click', () => {
      fileInput?.click();
    });
  }

  if (clearFilesBtn) {
    clearFilesBtn.addEventListener('click', () => {
      resetState();
    });
  }

  if (processBtn) {
    processBtn.addEventListener('click', convert);
  }
});
