/** Signal only after an asynchronously initialized tool has bound its file controls. */
export function notifyWorkspaceInputReady() {
  document.documentElement.dataset.workspaceInputReady = 'true';
  window.dispatchEvent(new Event('studio-input-ready'));
}
