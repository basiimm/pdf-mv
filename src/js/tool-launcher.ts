import { engines, groupForEngine, groups } from './config/workspace-catalog.js';
import {
  openCommandMenu,
  type CommandItem,
  type CommandSection,
} from '../design-system/ui/index.js';

const RECENT_KEY = 'pdfmv-recent-tools';
const MAX_RECENT = 5;

export function readRecentTools(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((v) => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
}

export function rememberTool(id: string): void {
  const next = [id, ...readRecentTools().filter((v) => v !== id)].slice(
    0,
    MAX_RECENT
  );
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* Recents are a convenience; storage may be unavailable. */
  }
}

interface Candidate extends CommandItem {
  keywords: string;
}

/** Engines by their own name, plus task groups; ranked by how well the name matches. */
export function searchTools(query: string, limit = 8): CommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const candidates: Candidate[] = [
    ...[...engines.values()].map((tool) => ({
      id: tool.id,
      label: tool.name,
      description: tool.subtitle,
      hint: groupForEngine.get(tool.id)?.name,
      keywords: `${tool.name} ${tool.subtitle}`.toLowerCase(),
    })),
    ...groups.map((group) => ({
      id: group.id,
      label: group.name,
      description: group.subtitle,
      hint: 'Task',
      keywords: `${group.name} ${group.subtitle}`.toLowerCase(),
    })),
  ];
  const score = (item: Candidate) => {
    const label = item.label.toLowerCase();
    if (label === q) return 0;
    if (label.startsWith(q)) return 1;
    if (label.split(/\s+/).some((word) => word.startsWith(q))) return 2;
    if (label.includes(q)) return 3;
    if (q.split(/\s+/).every((part) => item.keywords.includes(part))) return 4;
    return Infinity;
  };
  const seen = new Set<string>();
  return candidates
    .map((item) => ({ item, rank: score(item) }))
    .filter(({ rank }) => rank < Infinity)
    .sort((a, b) => a.rank - b.rank || a.item.label.localeCompare(b.item.label))
    .map(({ item }) => item)
    .filter((item) => !seen.has(item.id) && seen.add(item.id))
    .slice(0, limit)
    .map(({ id, label, description, hint }) => ({
      id,
      label,
      description,
      hint,
    }));
}

export interface LauncherHost {
  selectTool(id: string): void;
  openDocuments(): { id: string; name: string }[];
  activateDocument(id: string): void;
  chooseFiles(): void;
  browseAllTools(): void;
}

function toolItem(id: string): CommandItem | null {
  const engine = engines.get(id);
  if (engine)
    return {
      id,
      label: engine.name,
      description: engine.subtitle,
      hint: 'Recent',
    };
  const group = groups.find((g) => g.id === id);
  return group
    ? { id, label: group.name, description: group.subtitle, hint: 'Recent' }
    : null;
}

export function openToolLauncher(host: LauncherHost): () => void {
  return openCommandMenu({
    label: 'Find a tool or document',
    placeholder: 'Search tools and open documents…',
    sections(query): CommandSection[] {
      const q = query.trim().toLowerCase();
      const documents = host
        .openDocuments()
        .filter((doc) => !q || doc.name.toLowerCase().includes(q))
        .map((doc) => ({
          id: `document:${doc.id}`,
          label: doc.name,
          hint: 'Open tab',
        }));
      if (!q) {
        const recent = readRecentTools()
          .map(toolItem)
          .filter((item): item is CommandItem => !!item);
        const popular = [
          'edit-pdf',
          'merge-pdf',
          'compress-pdf',
          'organize-pdf',
          'sign-pdf',
          'convert',
        ]
          .map((id) => toolItem(id))
          .filter(
            (item): item is CommandItem =>
              !!item && !recent.some((r) => r.id === item.id)
          )
          .map((item): CommandItem => ({ ...item, hint: undefined }));
        return [
          { title: 'Recent tools', items: recent },
          { title: 'Open documents', items: documents },
          {
            title: 'Popular',
            items: popular.slice(0, 6 - Math.min(recent.length, 3)),
          },
          {
            title: 'Files',
            items: [{ id: 'action:open', label: 'Open a PDF…', hint: '⌘O' }],
          },
        ];
      }
      return [
        { title: 'Tools', items: searchTools(q) },
        { title: 'Open documents', items: documents },
      ];
    },
    onSelect(item) {
      if (item.id === 'action:open') host.chooseFiles();
      else if (item.id.startsWith('document:'))
        host.activateDocument(item.id.slice(9));
      else {
        rememberTool(item.id);
        host.selectTool(item.id);
      }
    },
    empty(query) {
      return {
        message: `No tools match “${query}”. Try a task like “merge”, a format like “Word”, or browse everything.`,
        actions: [{ label: 'Browse all tools', onClick: host.browseAllTools }],
      };
    },
  });
}
