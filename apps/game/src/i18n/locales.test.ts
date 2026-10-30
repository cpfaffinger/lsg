import { describe, expect, it } from 'vitest';
import de from './locales/de.json';
import en from './locales/en.json';

type Tree = { [key: string]: string | Tree };

function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`),
  );
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
}

function lookup(tree: Tree, path: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of path.split('.')) {
    if (typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

describe('locales', () => {
  it('German covers every English key and nothing more', () => {
    expect(keys(de as Tree).sort()).toEqual(keys(en as Tree).sort());
  });

  it('translations keep the same placeholders', () => {
    for (const key of keys(en as Tree)) {
      expect(placeholders(lookup(de as Tree, key) ?? ''), key).toEqual(
        placeholders(lookup(en as Tree, key) ?? ''),
      );
    }
  });
});
