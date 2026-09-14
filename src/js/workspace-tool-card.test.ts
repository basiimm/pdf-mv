import { describe, expect, it, vi } from 'vitest';
import { createToolCard } from './workspace-tool-card';
import { groups } from './config/workspace-catalog';
describe('Home tool card click targets', () => {
  it('opens every group from the card, icon, title, description and whitespace', () => {
    for (const group of groups) {
      const open = vi.fn();
      const card = createToolCard(
        group,
        [group.icon, '#fff', '#555'],
        group.subtitle,
        open
      );
      document.body.append(card);
      expect(card.tagName).toBe('BUTTON');
      expect(card.getAttribute('aria-label')).toBe(group.name);
      expect(card.querySelector('button, a')).toBeNull();
      card.click();
      for (const selector of [
        '.tool-card-top',
        '.tool-icon i',
        '.tool-card-title',
        '.tool-card-description',
      ])
        card
          .querySelector(selector)!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(open).toHaveBeenCalledTimes(5);
      card.remove();
    }
  });
});
