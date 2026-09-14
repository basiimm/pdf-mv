import { describe, expect, it } from 'vitest';
import { WorkspaceSession } from './workspace-session';
const document = (id: string, name = `${id}.pdf`) => ({
  id,
  name,
  size: 100,
  dirty: false,
  revision: 0,
  loading: false,
});

describe('PDF workspace session', () => {
  it('retains distinct documents with duplicate filenames when visiting Home', () => {
    const session = new WorkspaceSession();
    session.add(document('first', 'report.pdf'));
    session.add(document('second', 'report.pdf'));
    session.activate('second');
    session.markDirty('second');
    session.activate('home');
    expect(session.documents.size).toBe(2);
    expect(session.documents.get('second')?.dirty).toBe(true);
    expect(session.documents.get('first')?.dirty).toBe(false);
    expect(session.activeTab).toBe('home');
  });
  it('selects an adjacent document on close and returns to permanent Home on last close', () => {
    const session = new WorkspaceSession();
    session.add(document('first'));
    session.add(document('second'));
    session.add(document('third'));
    session.activate('second');
    expect(session.remove('second')).toBe('third');
    expect(session.remove('third')).toBe('first');
    expect(session.remove('first')).toBe('home');
    session.activate('missing');
    expect(session.activeTab).toBe('home');
  });
  it('keeps newer edits dirty if they happened during a download', () => {
    const session = new WorkspaceSession();
    session.add(document('first'));
    session.markDirty('first');
    const revision = session.documents.get('first')!.revision;
    session.markDirty('first');
    session.markDownloaded('first', revision);
    expect(session.hasUnsavedChanges).toBe(true);
    session.markDownloaded('first', session.documents.get('first')!.revision);
    expect(session.hasUnsavedChanges).toBe(false);
  });
  it('does not treat initial annotation imports as edits', () => {
    const session = new WorkspaceSession();
    session.add({ ...document('first'), loading: true });
    session.markDirty('first');
    expect(session.hasUnsavedChanges).toBe(false);
    session.documents.get('first')!.loading = false;
    session.markDirty('first');
    expect(session.hasUnsavedChanges).toBe(true);
  });
});
