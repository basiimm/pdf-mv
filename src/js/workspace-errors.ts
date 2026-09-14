export type WorkspaceErrorContext =
  | 'open'
  | 'preview'
  | 'apply'
  | 'convert'
  | 'merge';
export interface WorkspaceErrorDescription {
  message: string;
  action: 'retry' | 'choose-file' | 'fix-settings';
  actionLabel: string;
  details: string;
}

/** Keep engine exceptions out of the recovery message, while preserving diagnostics. */
export function describeWorkspaceError(
  error: unknown,
  context: WorkspaceErrorContext = 'apply'
): WorkspaceErrorDescription {
  const details =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');
  if (
    /page range|page numbers|preview page|enter some text|font size|valid color|does not support.*characters/i.test(
      details
    )
  ) {
    return {
      message: /page range|page numbers|preview page/i.test(details)
        ? 'Check the page range and use pages in this document, for example 1, 3-5.'
        : /characters/i.test(details)
          ? 'One of the characters is unavailable in this font. Try Latin text.'
          : 'Check the text, font size, angle and color before trying again.',
      action: 'fix-settings',
      actionLabel: 'Keep editing',
      details,
    };
  }
  if (/import|fetch|network|load.*module|chunk|wasm|worker/i.test(details)) {
    return {
      message:
        'The PDF engine could not load. Your file and settings are still available. Check your connection and try again.',
      action: 'retry',
      actionLabel: 'Retry engine loading',
      details,
    };
  }
  if (
    context === 'open' ||
    /invalid pdf|no pdf header|parse|encrypted|password|corrupt/i.test(details)
  ) {
    return {
      message:
        'We could not read this PDF. Try another PDF or export a fresh copy from its original app.',
      action: 'choose-file',
      actionLabel: 'Choose another file',
      details,
    };
  }
  return {
    message: `We could not ${context === 'preview' ? 'prepare the preview' : context === 'convert' ? 'convert this file' : context === 'merge' ? 'combine these files' : 'create the edited copy'}. Your original file and settings are safe. Try again.`,
    action: 'retry',
    actionLabel: 'Try again',
    details,
  };
}

export function renderWorkspaceError(
  container: HTMLElement,
  error: unknown,
  context: WorkspaceErrorContext,
  onRecover: (action: WorkspaceErrorDescription['action']) => void
): void {
  const description = describeWorkspaceError(error, context);
  const message = document.createElement('p');
  message.textContent = description.message;
  const recover = document.createElement('button');
  recover.type = 'button';
  recover.className = 'button button-secondary';
  recover.textContent = description.actionLabel;
  recover.onclick = () => onRecover(description.action);
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Technical details';
  const diagnostic = document.createElement('pre');
  diagnostic.textContent = description.details;
  details.append(summary, diagnostic);
  container.replaceChildren(message, recover, details);
}
