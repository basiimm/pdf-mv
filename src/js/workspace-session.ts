export interface WorkspaceDocument {
  id: string;
  name: string;
  size: number;
  dirty: boolean;
  revision: number;
  loading: boolean;
  toolOnly?: boolean;
}
/** A tab view is separate from the viewer's active document, so Home never unmounts it. */
export class WorkspaceSession {
  documents = new Map<string, WorkspaceDocument>();
  activeTab = 'home';
  add(document: WorkspaceDocument): void {
    this.documents.set(document.id, document);
  }
  activate(id: string): void {
    if (id === 'home' || this.documents.has(id)) this.activeTab = id;
  }
  markDirty(id: string): void {
    const document = this.documents.get(id);
    if (document && !document.loading) {
      document.dirty = true;
      document.revision++;
    }
  }
  markDownloaded(id: string, revision: number): void {
    const document = this.documents.get(id);
    if (document && document.revision === revision) document.dirty = false;
  }
  remove(id: string): string {
    const order = [...this.documents.keys()];
    const index = order.indexOf(id);
    this.documents.delete(id);
    if (this.activeTab === id)
      this.activeTab = order[index + 1] ?? order[index - 1] ?? 'home';
    return this.activeTab;
  }
  get hasUnsavedChanges(): boolean {
    return [...this.documents.values()].some((document) => document.dirty);
  }
}
