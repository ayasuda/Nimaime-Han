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
                  },
                  {
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
            "elements": [
              {
                "conditions": [
                  {
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
                  },
                  {
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
        "uri": "examples/sanmaime/valid/readme-user-details.sanmaime",
      }
    `);
  });

  it('tags-reserved', () => {
    const f = readFixture('valid', 'tags-reserved');
    const { document } = parse(f.source, { uri: f.uri });
    expect(
      document.screens.map((s) => ({
        screen: s.name,
        tags: s.tags,
        elements: s.elements.map((e) => ({ element: e.name, tags: e.tags })),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "elements": [
            {
              "element": "User Information",
              "tags": [
                {
                  "location": {
                    "column": 3,
                    "line": 7,
                  },
                  "name": "@critical",
                },
              ],
            },
            {
              "element": "Edit Action",
              "tags": [
                {
                  "location": {
                    "column": 3,
                    "line": 13,
                  },
                  "name": "@wip",
                },
                {
                  "location": {
                    "column": 8,
                    "line": 13,
                  },
                  "name": "@日本語タグ",
                },
              ],
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
