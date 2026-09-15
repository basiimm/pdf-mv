import { showAlert } from '../ui.js';
import { downloadFile, formatBytes } from '../utils/helpers.js';
import { icons, createIcons } from 'lucide';
import { ChangePermissionsState } from '@/types';
import { changePermissions as changePermissionsEngine } from '../engines/change-permissions.js';

const pageState: ChangePermissionsState = {
  file: null,
};

function resetState() {
  pageState.file = null;

  const fileDisplayArea = document.getElementById('file-display-area');
  if (fileDisplayArea) fileDisplayArea.innerHTML = '';

  const toolOptions = document.getElementById('tool-options');
  if (toolOptions) toolOptions.classList.add('hidden');

  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  if (fileInput) fileInput.value = '';

  const currentPassword = document.getElementById(
    'current-password'
  ) as HTMLInputElement;
  if (currentPassword) currentPassword.value = '';

  const newUserPassword = document.getElementById(
    'new-user-password'
  ) as HTMLInputElement;
  if (newUserPassword) newUserPassword.value = '';

  const newOwnerPassword = document.getElementById(
    'new-owner-password'
  ) as HTMLInputElement;
  if (newOwnerPassword) newOwnerPassword.value = '';
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
    metaSpan.textContent = formatBytes(pageState.file.size);

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

    if (toolOptions) toolOptions.classList.remove('hidden');
  } else {
    if (toolOptions) toolOptions.classList.add('hidden');
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

async function changePermissions() {
  if (!pageState.file) {
    showAlert('No File', 'Please upload a PDF file first.');
    return;
  }

  const currentPassword =
    (document.getElementById('current-password') as HTMLInputElement)?.value ||
    '';
  const newUserPassword =
    (document.getElementById('new-user-password') as HTMLInputElement)?.value ||
    '';
  const newOwnerPassword =
    (document.getElementById('new-owner-password') as HTMLInputElement)
      ?.value || '';

  if (newUserPassword && !newOwnerPassword) {
    showAlert(
      'Owner Password Required',
      'An owner password is required when setting permissions'
    );
    return;
  }

  const loaderModal = document.getElementById('loader-modal');
  const loaderText = document.getElementById('loader-text');

  const shouldEncrypt = !!(newUserPassword || newOwnerPassword);

  try {
    if (loaderModal) loaderModal.classList.remove('hidden');
    if (loaderText) loaderText.textContent = 'Processing PDF permissions...';

    const allowPrinting =
      (document.getElementById('allow-printing') as HTMLInputElement)
        ?.checked ?? true;
    const allowCopying =
      (document.getElementById('allow-copying') as HTMLInputElement)?.checked ??
      true;
    const allowModifying =
      (document.getElementById('allow-modifying') as HTMLInputElement)
        ?.checked ?? true;
    const allowAnnotating =
      (document.getElementById('allow-annotating') as HTMLInputElement)
        ?.checked ?? true;
    const allowFillingForms =
      (document.getElementById('allow-filling-forms') as HTMLInputElement)
        ?.checked ?? true;
    const allowDocumentAssembly =
      (document.getElementById('allow-document-assembly') as HTMLInputElement)
        ?.checked ?? true;
    const allowPageExtraction =
      (document.getElementById('allow-page-extraction') as HTMLInputElement)
        ?.checked ?? true;

    const outputFile = await changePermissionsEngine(
      pageState.file,
      {
        currentPassword,
        newUserPassword,
        newOwnerPassword,
        allowPrinting,
        allowCopying,
        allowModifying,
        allowAnnotating,
        allowFillingForms,
        allowDocumentAssembly,
        allowPageExtraction,
      },
      {
        signal: new AbortController().signal,
        progress: (p) => {
          if (loaderText) loaderText.textContent = p.label;
        },
      }
    );

    if (loaderText) loaderText.textContent = 'Preparing download...';
    downloadFile(outputFile, pageState.file.name);

    if (loaderModal) loaderModal.classList.add('hidden');

    let successMessage = 'PDF permissions changed successfully!';
    if (!shouldEncrypt) {
      successMessage =
        'PDF decrypted successfully! All encryption and restrictions removed.';
    }

    showAlert('Success', successMessage, 'success', () => {
      resetState();
    });
  } catch (error: unknown) {
    console.error('Error during PDF permission change:', error);
    if (loaderModal) loaderModal.classList.add('hidden');

    showAlert(
      'Processing Failed',
      `An error occurred: ${error instanceof Error ? error.message : 'The PDF might be corrupted or password protected.'}`
    );
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const dropZone = document.getElementById('drop-zone');
  const processBtn = document.getElementById('process-btn');
  const backBtn = document.getElementById('back-to-tools');

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      window.location.href = import.meta.env.BASE_URL;
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
    processBtn.addEventListener('click', changePermissions);
  }
});
