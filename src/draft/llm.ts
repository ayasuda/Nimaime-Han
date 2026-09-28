/**
 * Optional LLM refinement of a draft (docs/draft.md, "LLM adapters").
 *
 * Nimaime-Han ships no LLM client: an adapter is any function that sends a prompt to a model and
 * returns its text. `proposeWithLlm()` asks for an improved version of the rule-based candidate,
 * validates the answer with the Sanmaime parser, asks again with the diagnostics when it is invalid,
 * and falls back to the candidate when no valid answer comes back. The Sanmaime that is returned is
 * therefore always valid, and its definitions draft reuses the observed locators.
 */
import { formatDiagnostic, parse } from '../parser';
import type { Diagnostic, SanmaimeDocument } from '../parser';
import { renderDefinitions, type DefinitionElement, type LocatorSpec } from './definitions';
import { cleanName } from './names';
import { proposeSanmaime, type Proposal, type ProposeOptions } from './propose';
import type { ScreenObservation } from './types';

/** What an adapter receives. `system` + `prompt` is all a chat model needs; the rest is context. */
export interface LlmRequest {
  /** Instructions: the role, the Sanmaime v0 grammar and the rules of the answer. */
  system: string;
  /** The task: the observation summary, the candidate draft and (on a retry) its diagnostics. */
  prompt: string;
  observation: ScreenObservation;
  /** The rule-based draft to improve. */
  candidate: string;
}

/** Sends the request to a model and resolves to its answer (Sanmaime text, optionally fenced). */
export type LlmAdapter = (request: LlmRequest) => Promise<string>;

export interface LlmOptions extends ProposeOptions {
  /** How many times the adapter is asked (a retry includes the diagnostics). Default: 2. */
  maxAttempts?: number;
}

/** One answer of the adapter that was not used. */
export interface RejectedAnswer {
  attempt: number;
  /** The answer (empty when the adapter threw). */
  text: string;
  /** Why it was rejected: parser diagnostics, or a description of the problem. */
  problems: string[];
}

/**
 * The result of `proposeWithLlm()`. `sanmaime` and `definitions` are the accepted answer's (or the
 * candidate's); `elements` and `dropped` are always the rule-based candidate's.
 */
export interface LlmProposal extends Proposal {
  /** Which draft was returned. */
  source: 'llm' | 'rule-based';
  /** The rule-based proposal (the candidate the model was asked to improve). */
  candidate: Proposal;
  rejected: RejectedAnswer[];
  /** Targets of the LLM draft with no observed locator (written as TODO in the definitions). */
  unmatchedTargets: { element: string; target: string }[];
}

/** A summary of Sanmaime v0 for the system prompt. */
export const SANMAIME_GRAMMAR_SUMMARY = `Sanmaime v0 describes WHAT must be true on a screen, never HOW to find it (no selectors).
One construct per line; indentation is free (use 2 spaces per level); '#' starts a comment line.
  Screen: <name>          one per file
    Element: <name>       a part of the screen (unique within the screen)
      Show: <target>      the target is visible
      Hide: <target>      the target is hidden
      And: <target>       same as the Show:/Hide: line it follows (in the same block)
      Enable              the element itself is enabled (no argument)
      Disable             the element itself is disabled (no argument)
      When: <condition>   starts a block that holds only in that state of the screen
Expectations written before the first When: of an element hold in every state.
Rules: every Element needs at least one expectation; every When: block needs at least one
expectation; a target appears at most once per block; at most one Enable/Disable per block; a When:
block must not repeat what the element already asserts unconditionally; And: never follows
Enable/Disable. Names are plain text (no quotes).
Japanese files start with '# language: ja' and use 画面: 要素: 条件: 表示: 非表示: かつ: 有効 無効.`;

function systemPrompt(language: string): string {
  return `You write Sanmaime screen specifications for the testing tool Nimaime-Han.

${SANMAIME_GRAMMAR_SUMMARY}

Answer with one Sanmaime document only (no explanation), in ${language === 'ja' ? "Japanese keywords ('# language: ja' first)" : 'English keywords'}.
Describe only what a human would require of the screen. Reuse the target names of the candidate
draft (they are bound to observed locators); you may regroup and rename elements, drop noise, and
add Hide: for targets the observation reports as not visible.`;
}

/** A compact, model-friendly view of the observation. */
function observationSummary(observation: ScreenObservation): string {
  const lines = [`URL: ${observation.url}`, `Title: ${observation.title}`];
  for (const region of observation.regions) {
    const label = region.label ?? region.htmlId ?? '';
    lines.push(`Region ${region.id} (${region.kind}${label === '' ? '' : `: ${label}`}):`);
    for (const e of observation.elements.filter((x) => x.region === region.id)) {
      const parts = [e.role ?? e.tag];
      if (e.name !== undefined) parts.push(JSON.stringify(e.name));
      if (e.testId !== undefined) parts.push(`testid=${e.testId}`);
      if (!e.visible) parts.push('hidden');
      if (e.disabled === true) parts.push('disabled');
      lines.push(`  - ${parts.join(' ')}`);
    }
  }
  return lines.join('\n');
}

function userPrompt(
  observation: ScreenObservation,
  options: LlmOptions,
  candidate: string,
  previous: RejectedAnswer | undefined,
): string {
  const parts = [
    `Screen name: ${options.screen} (keep it exactly).`,
    '',
    'Observed page:',
    observationSummary(observation),
    '',
    'Candidate draft (valid; improve it):',
    candidate.trimEnd(),
  ];
  if (previous) {
    parts.push(
      '',
      'Your previous answer was rejected:',
      ...previous.problems.map((p) => `- ${p}`),
      'Answer again with a corrected document.',
    );
  }
  return parts.join('\n');
}

/** The answer without Markdown code fences and surrounding blank lines. */
export function extractSanmaime(answer: string): string {
  const fenced = /```[^\n]*\n([\s\S]*?)```/.exec(answer);
  const text = fenced?.[1] ?? answer;
  return `${text.replace(/^\s*\n/, '').trimEnd()}\n`;
}

/** Problems of an answer: parser errors, or a wrong number/name of screens. */
function checkAnswer(
  text: string,
  options: LlmOptions,
): { problems: string[]; document: SanmaimeDocument } {
  const language = options.language ?? 'en';
  const { document, diagnostics } = parse(text, { language });
  const problems = diagnostics
    .filter((d: Diagnostic) => d.severity === 'error')
    .map((d) => formatDiagnostic(d));
  const screen = cleanName(options.screen);
  if (problems.length === 0) {
    if (document.screens.length !== 1) {
      problems.push(`Expected exactly one Screen, found ${String(document.screens.length)}.`);
    } else if (document.screens[0]?.name !== screen) {
      problems.push(`The screen must be named "${screen}".`);
    }
    if (document.language !== language) {
      problems.push(`Use ${language} keywords.`);
    }
  }
  return { problems, document };
}

/** Definitions for the elements of an accepted LLM draft, reusing the candidate's locators. */
function definitionsFor(
  document: SanmaimeDocument,
  candidate: Proposal,
  observation: ScreenObservation,
  options: LlmOptions,
): { definitions: string; unmatched: { element: string; target: string }[] } {
  const locators = new Map<string, LocatorSpec>();
  const selves = new Map<string, LocatorSpec>();
  for (const element of candidate.elements) {
    for (const target of element.targets) {
      if (!locators.has(target.name)) locators.set(target.name, target.locator);
    }
    if (element.self) {
      selves.set(element.name, element.self);
      // An element made of one control may be renamed after it (`Login button`).
      const only = element.targets.length === 1 ? element.targets[0] : undefined;
      if (only && !locators.has(only.name)) locators.set(only.name, element.self);
    }
  }
  const unmatched: { element: string; target: string }[] = [];
  const elements: DefinitionElement[] = [];
  for (const element of document.screens[0]?.elements ?? []) {
    const expectations = [
      ...element.unconditional,
      ...element.conditions.flatMap((c) => c.expectations),
    ];
    const names: string[] = [];
    let needsSelf = false;
    for (const e of expectations) {
      if (e.kind === 'show' || e.kind === 'hide') {
        if (!names.includes(e.target)) names.push(e.target);
      } else {
        needsSelf = true;
      }
    }
    const targets = names.map((name) => {
      const locator = locators.get(name);
      if (!locator) unmatched.push({ element: element.name, target: name });
      return { name, locator };
    });
    let self: LocatorSpec | undefined;
    if (needsSelf) {
      self = selves.get(element.name) ?? locators.get(element.name);
      if (!self) {
        const only = targets.length === 1 ? targets[0]?.locator : undefined;
        self = only;
      }
    }
    elements.push({ name: element.name, self, selfTodo: needsSelf && !self, targets });
  }
  const definitions = renderDefinitions({
    screen: cleanName(options.screen),
    url: observation.url,
    elements,
    quotes: options.quotes ?? 'single',
  });
  return { definitions, unmatched };
}

/**
 * Proposes a draft with the rule-based proposer, then asks `adapter` to improve it (see the module
 * comment). Never throws because of the adapter: its errors and invalid answers are recorded in
 * `rejected` and the rule-based draft is used. @throws DraftError like `proposeSanmaime()`.
 */
export async function proposeWithLlm(
  observation: ScreenObservation,
  options: LlmOptions,
  adapter: LlmAdapter,
): Promise<LlmProposal> {
  const candidate = proposeSanmaime(observation, options);
  const language = candidate.language;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const rejected: RejectedAnswer[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const request: LlmRequest = {
      system: systemPrompt(language),
      prompt: userPrompt(observation, options, candidate.sanmaime, rejected.at(-1)),
      observation,
      candidate: candidate.sanmaime,
    };
    let answer: unknown;
    try {
      // Adapters are user code: do not trust the declared return type.
      answer = await adapter(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rejected.push({ attempt, text: '', problems: [`The adapter failed: ${message}`] });
      continue;
    }
    if (typeof answer !== 'string') {
      rejected.push({ attempt, text: '', problems: ['The adapter did not return a string.'] });
      continue;
    }
    let text = extractSanmaime(answer);
    // Keep the language explicit in Japanese drafts, like the rule-based proposer does.
    if (language !== 'en' && !/^\s*#\s*language\s*:/m.test(text)) {
      text = `# language: ${language}\n${text}`;
    }
    const { problems, document } = checkAnswer(text, options);
    if (problems.length > 0) {
      rejected.push({ attempt, text, problems });
      continue;
    }
    const { definitions, unmatched } = definitionsFor(document, candidate, observation, options);
    return {
      ...candidate,
      sanmaime: text,
      definitions,
      source: 'llm',
      candidate,
      rejected,
      unmatchedTargets: unmatched,
    };
  }
  return { ...candidate, source: 'rule-based', candidate, rejected, unmatchedTargets: [] };
}
