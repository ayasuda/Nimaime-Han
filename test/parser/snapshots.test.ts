import { describe, expect, it } from 'vitest';
import { parse } from '../../src/parser';
import { readFixture } from './fixtures';

describe('AST snapshots of the README fixtures', () => {
  it('readme-login', () => {
    const f = readFixture('valid', 'readme-login');
    const result = parse(f.source, { uri: f.uri });
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toMatchInlineSnapshot(`
      {
        "language": "en",
        "languageDirective": undefined,
        "screens": [
          {
            "background": [],
            "elements": [
              {
                "conditions": [],
                "location": {
                  "column": 3,
                  "line": 5,
                },
                "name": "Login Form",
                "tags": [],
                "unconditional": [
                  {
                    "keyword": "Show",
                    "kind": "show",
                    "location": {
                      "column": 5,
                      "line": 6,
                    },
                    "target": "Email address",
                    "viaAnd": false,
                  },
                  {
                    "keyword": "And",
                    "kind": "show",
                    "location": {
                      "column": 5,
                      "line": 7,
                    },
                    "target": "Password",
                    "viaAnd": true,
                  },
                  {
                    "keyword": "And",
                    "kind": "show",
                    "location": {
                      "column": 5,
                      "line": 8,
                    },
                    "target": "Login button",
                    "viaAnd": true,
                  },
                ],
              },
              {
                "conditions": [
                  {
                    "conditions": [
                      {
                        "keyword": "When",
                        "location": {
                          "column": 5,
                          "line": 11,
                        },
                        "name": "Input is valid",
                      },
                    ],
                    "expectations": [
                      {
                        "keyword": "Enable",
                        "kind": "enable",
                        "location": {
                          "column": 5,
                          "line": 12,
                        },
                      },
                    ],
                    "location": {
                      "column": 5,
                      "line": 11,
                    },
                    "name": "Input is valid",
                    "tags": [],
                    "title": "Input is valid",
                  },
                  {
                    "conditions": [
                      {
                        "keyword": "When",
                        "location": {
                          "column": 5,
                          "line": 14,
                        },
                        "name": "Input is invalid",
                      },
                    ],
                    "expectations": [
                      {
                        "keyword": "Disable",
                        "kind": "disable",
                        "location": {
                          "column": 5,
                          "line": 15,
                        },
                      },
                    ],
                    "location": {
                      "column": 5,
                      "line": 14,
                    },
                    "name": "Input is invalid",
                    "tags": [],
                    "title": "Input is invalid",
                  },
                ],
                "location": {
                  "column": 3,
                  "line": 10,
                },
                "name": "Login Button",
                "tags": [],
                "unconditional": [],
              },
            ],
            "location": {
              "column": 1,
              "line": 3,
            },
            "name": "Login",
            "tags": [],
          },
        ],
        "status": "approved",
        "uri": "examples/sanmaime/valid/readme-login.sanmaime",
      }
    `);
  });

  it('readme-user-details', () => {
    const f = readFixture('valid', 'readme-user-details');
    const result = parse(f.source, { uri: f.uri });
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toMatchInlineSnapshot(`
      {
        "language": "en",
        "languageDirective": undefined,
        "screens": [
          {
            "background": [],
            "elements": [
              {
                "conditions": [
                  {
                    "conditions": [
                      {
                        "keyword": "When",
                        "location": {
                          "column": 5,
                          "line": 8,
                        },
                        "name": "Viewing your own profile",
                      },
                    ],
                    "expectations": [
                      {
                        "keyword": "Show",
                        "kind": "show",
                        "location": {
                          "column": 5,
                          "line": 9,
                        },
                        "target": "Username",
                        "viaAnd": false,
                      },
                      {
                        "keyword": "And",
                        "kind": "show",
                        "location": {
                          "column": 5,
                          "line": 10,
                        },
                        "target": "Full name",
                        "viaAnd": true,
                      },
                      {
                        "keyword": "And",
                        "kind": "show",
                        "location": {
                          "column": 5,
                          "line": 11,
                        },
                        "target": "Email address",
                        "viaAnd": true,
                      },
                    ],
                    "location": {
                      "column": 5,
                      "line": 8,
                    },
                    "name": "Viewing your own profile",
                    "tags": [],
                    "title": "Viewing your own profile",
                  },
                  {
                    "conditions": [
                      {
                        "keyword": "When",
                        "location": {
                          "column": 5,
                          "line": 13,
                        },
                        "name": "Viewing another user's profile",
                      },
                    ],
                    "expectations": [
                      {
                        "keyword": "Show",
                        "kind": "show",
                        "location": {
                          "column": 5,
                          "line": 14,
                        },
                        "target": "Username",
                        "viaAnd": false,
                      },
                      {
                        "keyword": "Hide",
                        "kind": "hide",
                        "location": {
                          "column": 5,
                          "line": 15,
                        },
                        "target": "Full name",
                        "viaAnd": false,
                      },
                      {
                        "keyword": "And",
                        "kind": "hide",
                        "location": {
                          "column": 5,
                          "line": 16,
                        },
                        "target": "Email address",
                        "viaAnd": true,
                      },
                    ],
                    "location": {
                      "column": 5,
                      "line": 13,
                    },
                    "name": "Viewing another user's profile",
                    "tags": [],
                    "title": "Viewing another user's profile",
                  },
                ],
                "location": {
                  "column": 3,
                  "line": 6,
                },
                "name": "User Information",
                "tags": [],
                "unconditional": [],
              },
            ],
            "location": {
              "column": 1,
              "line": 4,
            },
            "name": "User Details",
            "tags": [],
          },
        ],
        "status": "approved",
        "uri": "examples/sanmaime/valid/readme-user-details.sanmaime",
      }
    `);
  });

  it('tags', () => {
    const f = readFixture('valid', 'tags');
    const { document } = parse(f.source, { uri: f.uri });
    const names = (tags: readonly { name: string }[]): string => tags.map((t) => t.name).join(' ');
    expect(
      document.screens.map((s) => ({
        screen: s.name,
        tags: s.tags,
        elements: s.elements.map((e) => ({
          element: e.name,
          tags: names(e.tags),
          conditions: e.conditions.map((c) => ({ condition: c.name, tags: c.tags })),
        })),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "elements": [
            {
              "conditions": [
                {
                  "condition": "Viewing another user's profile",
                  "tags": [
                    {
                      "location": {
                        "column": 5,
                        "line": 13,
                      },
                      "name": "@slow",
                    },
                  ],
                },
              ],
              "element": "User Information",
              "tags": "@critical",
            },
            {
              "conditions": [],
              "element": "Edit Action",
              "tags": "@wip @日本語タグ",
            },
          ],
          "screen": "User Details",
          "tags": [
            {
              "location": {
                "column": 1,
                "line": 3,
              },
              "name": "@smoke",
            },
            {
              "location": {
                "column": 8,
                "line": 3,
              },
              "name": "@regression",
            },
            {
              "location": {
                "column": 1,
                "line": 4,
              },
              "name": "@owner:team-profile",
            },
          ],
        },
      ]
    `);
  });
});
