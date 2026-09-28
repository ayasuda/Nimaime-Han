/** Hand-written observations for the unit tests of `nimaime draft`. */
import type { ObservedElement, ObservedRegion, ScreenObservation } from '../../src/draft';

export function observation(
  regions: ObservedRegion[],
  elements: ObservedElement[],
  extra: Partial<ScreenObservation> = {},
): ScreenObservation {
  return {
    format: 'nimaime-observation',
    version: 1,
    url: 'http://localhost:3000/login',
    title: 'Log in',
    testIdAttribute: 'data-testid',
    regions,
    elements,
    truncated: false,
    ...extra,
  };
}

const base = { visible: true, enabled: true } as const;

/** The observation of examples/basic/app/login.html (as `observeScreen` records it). */
export const LOGIN = observation(
  [
    { id: 'page', kind: 'page', tag: 'body' },
    { id: 'r1', kind: 'form', tag: 'form', htmlId: 'login-form' },
  ],
  [
    {
      ...base,
      tag: 'h1',
      role: 'heading',
      name: 'Log in',
      nameSource: 'content',
      text: 'Log in',
      level: 1,
      region: 'page',
    },
    {
      ...base,
      tag: 'input',
      role: 'textbox',
      name: 'Email address',
      nameSource: 'label',
      type: 'email',
      disabled: false,
      region: 'r1',
    },
    {
      ...base,
      tag: 'input',
      name: 'Password',
      nameSource: 'label',
      type: 'password',
      disabled: false,
      region: 'r1',
    },
    {
      tag: 'button',
      role: 'button',
      name: 'Log in',
      nameSource: 'content',
      visible: true,
      enabled: false,
      disabled: true,
      region: 'r1',
    },
  ],
);

/** A user details page with landmarks, test ids, a hidden element and duplicates. */
export const USER_DETAILS = observation(
  [
    { id: 'page', kind: 'page', tag: 'body' },
    { id: 'r1', kind: 'nav', tag: 'nav' },
    { id: 'r2', kind: 'main', tag: 'main' },
    { id: 'r3', kind: 'section', tag: 'section', label: 'User Information', parent: 'r2' },
  ],
  [
    {
      ...base,
      tag: 'a',
      role: 'link',
      name: 'Home',
      nameSource: 'content',
      text: 'Home',
      region: 'r1',
    },
    {
      ...base,
      tag: 'a',
      role: 'link',
      name: 'Settings',
      nameSource: 'content',
      text: 'Settings',
      region: 'r1',
    },
    {
      ...base,
      tag: 'a',
      role: 'link',
      name: 'Settings',
      nameSource: 'content',
      text: 'Settings',
      region: 'r1',
    },
    {
      ...base,
      tag: 'h1',
      role: 'heading',
      name: 'User details',
      nameSource: 'content',
      text: 'User details',
      level: 1,
      region: 'r2',
    },
    { ...base, tag: 'dd', testId: 'username', text: 'alice', region: 'r3' },
    { ...base, tag: 'dd', testId: 'full-name', text: 'Alice Liddell', region: 'r3' },
    { ...base, tag: 'dd', testId: 'email', text: 'alice@example.com', region: 'r3' },
    { visible: false, enabled: true, tag: 'dd', testId: 'secret', region: 'r3' },
    {
      ...base,
      tag: 'button',
      testId: 'edit-button',
      role: 'button',
      name: 'Edit',
      nameSource: 'content',
      disabled: false,
      region: 'r2',
    },
  ],
  { url: 'http://localhost:3000/users/me', title: 'User details' },
);
