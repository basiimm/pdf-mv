import { showLoader, hideLoader, showAlert } from '../ui.js';
import { downloadFile } from '../utils/helpers.js';
import { state } from '../state.js';
import JSZip from 'jszip';
import { deduplicateFileName } from '../utils/deduplicate-filename.js';
import { batchDecryptIfNeeded } from '../utils/password-prompt.js';
import { repairPdf as repairPdfEngine } from '../engines/repair-pdf.js';

export async function repairPdfFile(file: File): Promise<Uint8Array | null> {
  try {
    const repaired = await repairPdfEngine(
      file,
      {},
      { signal: new AbortController().signal, progress: () => {} }
    );
    return new Uint8Array(await repaired.arrayBuffer());
  } catch (error) {
    console.error(`Error repairing ${file.name}:`, error);
    return null;
  }
}

export async function repairPdf() {
  if (state.files.length === 0) {
    showAlert('No Files', 'Please select one or more PDF files.');
    return;
  }

  const successfulRepairs: { name: string; data: Uint8Array }[] = [];
  const failedRepairs: string[] = [];

  try {
    const decryptedFiles = await batchDecryptIfNeeded(state.files);
    showLoader('Initializing repair engine...');
    state.files = decryptedFiles;

    for (let i = 0; i < state.files.length; i++) {
      const file = state.files[i];
      showLoader(`Repairing ${file.name} (${i + 1}/${state.files.length})...`);

      const repairedData = await repairPdfFile(file);

      if (repairedData && repairedData.length > 0) {
        successfulRepairs.push({
          name: `repaired-${file.name}`,
          data: repairedData,
        });
      } else {
        failedRepairs.push(file.name);
      }
    }

    hideLoader();

    if (successfulRepairs.length === 0) {
      showAlert(
        'Repair Failed',
        'Unable to repair any of the uploaded PDF files.'
      );
      return;
    }

    if (failedRepairs.length > 0) {
      const failedList = failedRepairs.join(', ');
      showAlert(
        'Partial Success',
        `Repaired ${successfulRepairs.length} file(s). Failed to repair: ${failedList}`
      );
    }

    if (successfulRepairs.length === 1) {
      const file = successfulRepairs[0];
      const blob = new Blob([new Uint8Array(file.data)], {
        type: 'application/pdf',
      });
      downloadFile(blob, file.name);
    } else {
      showLoader('Creating ZIP archive...');
      const zip = new JSZip();
      const usedNames = new Set<string>();
      successfulRepairs.forEach((file) => {
        const zipEntryName = deduplicateFileName(file.name, usedNames);
        zip.file(zipEntryName, file.data);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadFile(zipBlob, 'repaired_pdfs.zip');
      hideLoader();
    }

    if (failedRepairs.length === 0) {
      showAlert('Success', 'All files repaired successfully!');
    }
  } catch (error: unknown) {
    console.error('Critical error during repair:', error);
    hideLoader();
    showAlert(
      'Error',
      'An unexpected error occurred during the repair process.'
    );
  }
}
