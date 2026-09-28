/**
 * Hooks: the definition API (beforeScreen / afterScreen / beforeElement / afterElement), the
 * registry lookups (findHooks / hooksFor: scoping and order) and the hook runner (createHookRunner
 * with a fake driver: steps, info, fixtures, errors).
 */
import { fileURLToPath } from 'node:url';
import { test as base } from '@playwright/test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNimaime, NimaimeDefinitionError, NimaimeHookError } from '../../src/index';
import {
  createHookRunner,
  findHooks,
  getRegistry,
  hooksFor,
  NimaimeRuntimeError,
  resetRegistry,
  type HookDriver,
  type HookInfo,
  type StepLocation,
} from '../../src/runtime/index';

const thisFile = fileURLToPath(import.meta.url);

// `log` is a custom fixture: hooks write into it.
const test = base.extend<{ log: string[] }, { workerLog: string[] }>({
  log: [],
  workerLog: [[], { scope: 'worker' }],
});

const { beforeScreen, afterScreen, beforeElement, afterElement } = createNimaime(test);

beforeEach(() => {
  resetRegistry();
});

/** The hooks' `tags` as labels: each test hook gets a label through `tags` for readability. */
const labels = (hooks: { tags: string | undefined }[]): (string | undefined)[] =>
  hooks.map((hook) => hook.tags);

describe('hook definitions', () => {
  it('registers every kind with its scope, test and source location', () => {
    const fn = (): void => undefined;
    beforeScreen(fn);
    afterScreen(fn, { screen: 'Login' });
    beforeElement(fn, { element: 'Login Form' });
    afterElement(fn, { screen: 'Login', element: 'Login Form', tags: '@smoke' });
    const { hooks } = getRegistry();
    expect(
      hooks.map(({ kind, screen, element, tags, customTest }) => ({
        kind,
        screen,
        element,
        tags,
        customTest,
      })),
    ).toEqual([
      {
        kind: 'beforeScreen',
        screen: undefined,
        element: undefined,
        tags: undefined,
        customTest: true,
      },
      {
        kind: 'afterScreen',
        screen: 'Login',
        element: undefined,
        tags: undefined,
        customTest: true,
      },
      {
        kind: 'beforeElement',
        screen: undefined,
        element: 'Login Form',
        tags: undefined,
        customTest: true,
      },
      {
        kind: 'afterElement',
        screen: 'Login',
        element: 'Login Form',
        tags: '@smoke',
        customTest: true,
      },
    ]);
    expect(hooks[0]?.test).toBe(test);
    expect(hooks[0]?.source).toMatchObject({ file: thisFile });
    expect(hooks[1]?.source?.line).toBe((hooks[0]?.source?.line ?? 0) + 1);
  });

  it('ignores the same call site evaluated again and the same function in the same scope', () => {
    const fn = (): void => undefined;
    for (let i = 0; i < 2; i++) beforeElement(() => undefined, { element: 'A' });
    beforeScreen(fn, { screen: 'X' });
    beforeScreen(fn, { screen: 'X' });
    expect(getRegistry().hooks).toHaveLength(2);
  });

  it('keeps several hooks of the same scope, and the same function in other scopes or kinds', () => {
    const fn = (): void => undefined;
    beforeScreen(fn, { screen: 'X' });
    beforeScreen(fn, { screen: 'Y' });
    afterScreen(fn, { screen: 'X' });
    beforeScreen(() => undefined, { screen: 'X' });
    expect(getRegistry().hooks).toHaveLength(4);
  });

  it('validates its arguments', () => {
    const fn = (): void => undefined;
    const call = (f: () => void): unknown => {
      try {
        f();
      } catch (error) {
        return error;
      }
      return undefined;
    };
    const cases: [() => void, string][] = [
      [
        () => {
          beforeScreen('nope' as never);
        },
        'beforeScreen(): the first argument must be a function.',
      ],
      [
        () => {
          afterScreen(fn, 'Login' as never);
        },
        'afterScreen(): the second argument must be an object like { screen }.',
      ],
      [
        () => {
          beforeElement(fn, [] as never);
        },
        'beforeElement(): the second argument must be an object like { screen, element }.',
      ],
      [
        () => {
          beforeScreen(fn, { screen: ' ' });
        },
        'beforeScreen(): the screen name must be a non-empty string.',
      ],
      [
        () => {
          afterElement(fn, { element: '' });
        },
        'afterElement(): the element name must be a non-empty string.',
      ],
      [
        () => {
          beforeScreen(fn, { element: 'A' } as never);
        },
        'beforeScreen(): screen hooks take no `element` option; use beforeElement / afterElement.',
      ],
      [
        () => {
          beforeElement(fn, { tags: 1 } as never);
        },
        'beforeElement(): `tags` must be a tag expression string.',
      ],
    ];
    for (const [f, message] of cases) {
      const error = call(f);
      expect(error).toBeInstanceOf(NimaimeDefinitionError);
      expect((error as Error).message).toBe(message);
    }
    expect(getRegistry().hooks).toEqual([]);
  });

  it('is removed by resetRegistry()', () => {
    beforeScreen(() => undefined);
    resetRegistry();
    expect(getRegistry().hooks).toEqual([]);
  });
});

describe('findHooks / hooksFor', () => {
  it('orders before hooks global, screen, element, screen + element, in registration order', () => {
    const fn = (): void => undefined;
    beforeElement(fn, { screen: 'Login', element: 'Form', tags: 'screen+element' });
    beforeElement(fn, { element: 'Form', tags: 'element' });
    beforeElement(fn, { screen: 'Login', tags: 'screen 1' });
    beforeElement(fn, { tags: 'global 1' });
    beforeElement(fn, { screen: 'Login', tags: 'screen 2' });
    beforeElement(fn, { tags: 'global 2' });
    beforeElement(fn, { screen: 'Other', tags: 'other screen' });
    beforeElement(fn, { element: 'Other', tags: 'other element' });
    afterElement(fn, { tags: 'after global' });
    afterElement(fn, { element: 'Form', tags: 'after element' });
    afterElement(fn, { screen: 'Login', tags: 'after screen' });

    expect(labels(findHooks('beforeElement', { screen: 'Login', element: 'Form' }))).toEqual([
      'global 1',
      'global 2',
      'screen 1',
      'screen 2',
      'element',
      'screen+element',
    ]);
    const set = hooksFor('Login', 'Form');
    expect(labels(set.before)).toHaveLength(6);
    expect(labels(set.after)).toEqual(['after element', 'after screen', 'after global']);
    expect(labels(findHooks('beforeElement', { screen: 'Other', element: 'Form' }))).toEqual([
      'global 1',
      'global 2',
      'other screen',
      'element',
    ]);
  });

  it('separates screen hooks from element hooks and compares trimmed names', () => {
    const fn = (): void => undefined;
    beforeScreen(fn, { tags: 'global' });
    beforeScreen(fn, { screen: ' Login ', tags: 'login' });
    afterScreen(fn, { tags: 'after global' });
    afterScreen(fn, { screen: 'Login', tags: 'after login' });
    beforeElement(fn, { tags: 'element hook' });
    expect(labels(hooksFor('Login').before)).toEqual(['global', 'login']);
    expect(labels(hooksFor('Login').after)).toEqual(['after login', 'after global']);
    expect(labels(hooksFor('Home').before)).toEqual(['global']);
    expect(labels(hooksFor('Login', 'Form').before)).toEqual(['element hook']);
    expect(hooksFor('Login', 'Form').after).toEqual([]);
  });
});

interface Harness {
  run: ReturnType<typeof createHookRunner>;
  steps: { title: string; location: StepLocation | undefined }[];
  log: string[];
  title: { value: string | undefined };
}

function harness(): Harness {
  const steps: Harness['steps'] = [];
  const log: string[] = [];
  const title = { value: undefined as string | undefined };
  const driver: HookDriver = {
    async step(stepTitle, body, location) {
      steps.push({ title: stepTitle, location });
      log.push(`step ${stepTitle}`);
      await body();
    },
    testTitle: () => title.value,
  };
  return { run: createHookRunner(driver), steps, log, title };
}

describe('createHookRunner', () => {
  it('runs the matching hooks in order, each in a step located at its definition', async () => {
    const h = harness();
    beforeScreen(({ workerLog }, info) => {
      workerLog.push(`global ${JSON.stringify(info)}`);
    });
    beforeScreen(
      async ({ workerLog }, info) => {
        await Promise.resolve();
        workerLog.push(`login ${info.screen}`);
      },
      { screen: 'Login' },
    );
    beforeScreen(
      () => {
        throw new Error('must not run');
      },
      { screen: 'Home' },
    );
    await h.run('beforeScreen', { workerLog: h.log }, { screen: 'Login' });
    expect(h.log).toEqual([
      'step BeforeScreen: Login',
      'global {"screen":"Login"}',
      'step BeforeScreen: Login',
      'login Login',
    ]);
    const [first, second] = getRegistry().hooks;
    expect(h.steps.map((step) => step.location)).toEqual([first?.source, second?.source]);
    expect(h.steps[0]?.location).toMatchObject({ file: thisFile });
  });

  it('does nothing when no hook matches', async () => {
    const h = harness();
    afterElement(() => undefined, { element: 'Other' });
    await h.run('afterElement', {}, { screen: 'Login', element: 'Form' });
    expect(h.steps).toEqual([]);
  });

  it('passes { screen, element, condition } to element hooks', async () => {
    const h = harness();
    const infos: HookInfo[] = [];
    beforeElement((_fixtures, info) => {
      infos.push(info);
    });
    await h.run('beforeElement', {}, { screen: 'Login', element: 'Form', condition: 'Valid' });
    // Without `condition`, it is taken from a `When: …` test title…
    h.title.value = 'When: Input is invalid';
    await h.run('beforeElement', {}, { screen: 'Login', element: 'Form' });
    // …and left out for the unconditional block.
    h.title.value = 'Always';
    await h.run('beforeElement', {}, { screen: 'Login', element: 'Form' });
    // An explicit `condition: undefined` wins over the title.
    h.title.value = 'When: Input is invalid';
    await h.run('beforeElement', {}, { screen: 'Login', element: 'Form', condition: undefined });
    expect(infos).toEqual([
      { screen: 'Login', element: 'Form', condition: 'Valid' },
      { screen: 'Login', element: 'Form', condition: 'Input is invalid' },
      { screen: 'Login', element: 'Form' },
      { screen: 'Login', element: 'Form' },
    ]);
    expect(h.steps.map((step) => step.title)).toEqual(
      Array.from({ length: 4 }, () => 'BeforeElement: Form'),
    );
  });

  it('runs after hooks in reverse order of scope', async () => {
    const h = harness();
    afterElement(({ log }) => log.push('global'));
    afterElement(({ log }) => log.push('screen'), { screen: 'Login' });
    afterElement(({ log }) => log.push('element'), { element: 'Form' });
    await h.run('afterElement', { log: h.log }, { screen: 'Login', element: 'Form' });
    expect(h.log.filter((entry) => !entry.startsWith('step'))).toEqual([
      'element',
      'screen',
      'global',
    ]);
  });

  it('prefixes errors with the hook and its scope and stops before hooks at the first failure', async () => {
    const h = harness();
    const original = new Error('login failed');
    beforeElement(() => {
      throw original;
    });
    beforeElement(({ log }) => log.push('second'));
    const error = await h
      .run('beforeElement', { log: h.log }, { screen: 'Login', element: 'Form' })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(NimaimeHookError);
    expect(error).toMatchObject({
      name: 'NimaimeHookError',
      message: 'BeforeElement hook for Element "Form" failed: login failed',
      cause: original,
    });
    const stack = (error as Error).stack ?? '';
    expect(stack.split('\n')[0]).toBe(
      'NimaimeHookError: BeforeElement hook for Element "Form" failed: login failed',
    );
    expect(stack).toContain(thisFile);
    expect(h.log).not.toContain('second');
  });

  it('names the screen for screen hooks and handles thrown non-errors', async () => {
    const h = harness();
    beforeScreen(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'boom';
    });
    const error = await h.run('beforeScreen', {}, { screen: 'Login' }).catch((e: unknown) => e);
    expect((error as Error).message).toBe('BeforeScreen hook for Screen "Login" failed: boom');
    expect((error as Error).stack).toContain(`at ${thisFile}:`);
  });

  it('runs every after hook and throws the first failure', async () => {
    const h = harness();
    afterScreen(({ workerLog }) => workerLog.push('global'));
    afterScreen(
      () => {
        throw new Error('second');
      },
      { screen: 'Login' },
    );
    afterScreen(
      () => {
        throw new Error('first');
      },
      { screen: 'Login' },
    );
    const error = await h
      .run('afterScreen', { workerLog: h.log }, { screen: 'Login' })
      .catch((e: unknown) => e);
    expect((error as Error).message).toBe('AfterScreen hook for Screen "Login" failed: first');
    expect(h.log.filter((entry) => !entry.startsWith('step'))).toEqual(['global']);
    expect(h.steps).toHaveLength(3);
  });

  it('guards the fixtures: a fixture that was not passed fails with a clear message', async () => {
    const h = harness();
    beforeElement(({ log }) => log.push('x'));
    const error = await h
      .run('beforeElement', {}, { screen: 'Login', element: 'Form' })
      .catch((e: unknown) => e);
    expect((error as Error).message).toBe(
      'BeforeElement hook for Element "Form" failed: The hook uses the fixture "log", ' +
        'but the test did not provide it. Regenerate the specs (nimaime-gen) or pass "log" to $nimaime.',
    );
  });

  it('rejects an info object without the names it needs', async () => {
    const h = harness();
    await expect(h.run('beforeScreen', {}, {} as HookInfo)).rejects.toThrow(NimaimeRuntimeError);
    await expect(h.run('beforeElement', {}, { screen: 'Login' })).rejects.toThrow(
      "runHooks('beforeElement'): info.element must be an Element name.",
    );
  });
});
