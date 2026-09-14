import type { ToolGroup } from './config/workspace-catalog.js';

/** One native click target for the icon, title, description and card whitespace. */
export function createToolCard(
  tool: ToolGroup,
  visual: [string, string, string],
  description: string,
  open: () => void
): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'tool-card';
  card.setAttribute('aria-label', tool.name);
  card.style.setProperty('--icon-bg', visual[1]);
  card.style.setProperty('--icon-color', visual[2]);
  const top = document.createElement('span');
  top.className = 'tool-card-top';
  const badge = document.createElement('span');
  badge.className = 'tool-icon';
  const glyph = document.createElement('i');
  glyph.dataset.lucide = visual[0];
  badge.append(glyph);
  const arrow = document.createElement('i');
  arrow.dataset.lucide = 'arrow-right';
  arrow.className = 'tool-card-arrow';
  top.setAttribute('aria-hidden', 'true');
  top.append(badge, arrow);
  const title = document.createElement('span');
  title.className = 'tool-card-title';
  title.textContent = tool.name;
  const detail = document.createElement('span');
  detail.className = 'tool-card-description';
  detail.textContent = description;
  card.append(top, title, detail);
  card.addEventListener('click', open);
  return card;
}
