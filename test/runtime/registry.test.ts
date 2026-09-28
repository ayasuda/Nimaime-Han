import { beforeEach, describe, expect, it } from 'vitest';
import { createNimaime } from '../../src/index';
import {
  findCondition,
  findElement,
  findScreen,
  getRegistry,
  listDefinitions,
  resetRegistry,
} from '../../src/runtime/index';

const { defineScreen, defineElement, defineCondition } = createNimaime();
const noop = () => undefined;
const locator = () => ({}) as never;

beforeEach(() => {
  resetRegistry();
});

describe('registry', () => {
  it('is a process-wide singleton stored on globalThis', () => {
    const registry = getRegistry();
    expect(getRegistry()).toBe(registry);
    expect((globalThis as Record<symbol, unknown>)[Symbol.for('nimaime-han.registry')]).toBe(
      registry,
    );
  });

  it('keeps screens, elements and conditions in separate namespaces', () => {
    defineScreen('Login');
    defineElement('Login', { A: locator });
    defineCondition('Login', noop);
    const registry = getRegistry();
    expect(registry.screens.size).toBe(1);
    expect(registry.elements.size).toBe(1);
    expect(registry.conditions.size).toBe(1);
  });

  it('resetRegistry removes every definition', () => {
    defineScreen('S');
    defineElement('E', { A: locator });
    defineCondition('C', noop);
    resetRegistry();
    expect(findScreen('S')).toBeUndefined();
    expect(findElement('E')).toBeUndefined();
    expect(findCondition('C')).toBeUndefined();
    expect(listDefinitions()).toEqual({ screens: [], elements: [], conditions: [] });
  });

  it('lists definitions in registration order, conditions grouped by name', () => {
    defineScreen('B');
    defineScreen('A');
    defineElement('Y', { T: locator });
    defineElement('X', locator);
    defineCondition('c1', noop, { screen: 'A' });
    defineCondition('c2', noop);
    defineCondition('c1', noop);
    defineCondition('c1', noop, { screen: 'B' });
    const all = listDefinitions();
    expect(all.screens.map((s) => s.name)).toEqual(['B', 'A']);
    expect(all.elements.map((e) => e.name)).toEqual(['Y', 'X']);
    expect(all.conditions.map((c) => [c.name, c.screen])).toEqual([
      ['c1', undefined],
      ['c1', 'A'],
      ['c1', 'B'],
      ['c2', undefined],
    ]);
  });

  it('returns undefined for unknown names', () => {
    expect(findScreen('Nope')).toBeUndefined();
    expect(findElement('Nope')).toBeUndefined();
    expect(findCondition('Nope', { screen: 'Nope' })).toBeUndefined();
  });
});
