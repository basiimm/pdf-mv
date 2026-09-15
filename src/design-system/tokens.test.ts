import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { palette } from './tokens';

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');

function declarations(block: string) {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ])
  );
}

const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('@media'));
const darkBlock = css.slice(
  css.lastIndexOf(":root[data-studio-theme='dark'] {"),
  css.indexOf('Legacy aliases')
);
const primitives = declarations(rootBlock);

function resolveValue(value: string): string {
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  return ref ? resolveValue(primitives[ref[1]]) : value.toLowerCase();
}

describe('design tokens', () => {
  for (const [theme, block] of [
    ['light', rootBlock],
    ['dark', darkBlock],
  ] as const) {
    it(`tokens.ts mirrors tokens.css (${theme})`, () => {
      // Dark only overrides what differs; everything else inherits from :root.
      const declared = { ...primitives, ...declarations(block) };
      for (const [name, hex] of Object.entries(palette[theme])) {
        expect(declared[`ds-${name}`], `--ds-${name}`).toBeDefined();
        expect(resolveValue(declared[`ds-${name}`]), `--ds-${name}`).toBe(hex);
      }
    });
  }

  it('keeps the dark media query identical to the explicit dark theme', () => {
    const media = css.slice(
      css.indexOf('@media'),
      css.lastIndexOf(":root[data-studio-theme='dark']")
    );
    expect(declarations(media)).toEqual(declarations(darkBlock));
  });
});
