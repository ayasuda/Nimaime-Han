#!/usr/bin/env node
/**
 * `nimaime-gen` CLI: generates Playwright spec files from `.sanmaime` files.
 *
 * TODO: implement commands (generate, export, ...). Currently only `--version` / `--help`.
 */
import { VERSION } from '../version';

const HELP = `Usage: nimaime-gen [options]

Generate Playwright test files from .sanmaime specifications.

Options:
  -v, --version  Print the version
  -h, --help     Print this help`;

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  console.log(VERSION);
} else if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
} else {
  console.error('nimaime-gen: not implemented yet.');
  console.error(HELP);
  process.exitCode = 1;
}
