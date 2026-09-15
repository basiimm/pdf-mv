import { describe, expect, it } from 'vitest';
import { describeWorkspaceError } from './workspace-errors.js';

describe('workspace error recovery', () => {
  it('keeps an import URL in optional diagnostics, not the recovery message', () => {
    const error = new Error(
      'Failed to fetch dynamically imported module: https://example.test/private-engine.js'
    );
    const result = describeWorkspaceError(error, 'preview');
    expect(result.action).toBe('retry');
    expect(result.message).not.toContain('https://');
    expect(result.details).toContain('private-engine.js');
  });
  it('offers a settings correction for invalid scope', () => {
    expect(
      describeWorkspaceError(new Error('Page range must be between 1 and 5.'))
        .action
    ).toBe('fix-settings');
  });
  it('offers a replacement for unreadable files and a retry for unknown failures', () => {
    expect(
      describeWorkspaceError(new Error('No PDF header found')).action
    ).toBe('choose-file');
    expect(describeWorkspaceError(null).action).toBe('retry');
  });
});
