#!/usr/bin/env node
/**
 * `nimaime` CLI: works with the specifications of live screens — `nimaime draft` proposes a
 * Sanmaime draft from a running screen (docs/draft.md), `nimaime diff` compares a specification
 * with the screen as it is now and `nimaime approve` marks reviewed drafts as approved
 * (docs/review-workflow.md).
 */
import { nimaimeMain } from './nimaime-main';

void nimaimeMain(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }).then(
  (code) => {
    process.exitCode = code;
  },
);
