#!/usr/bin/env node
/**
 * `nimaime-gen` CLI: generates Playwright spec files from `.sanmaime` files (docs/cli.md).
 */
import { main } from './main';

void main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }).then(
  (code) => {
    process.exitCode = code;
  },
);
