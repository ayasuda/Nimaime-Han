/**
 * Reading and rewriting the `# status:` header directive of a `.sanmaime` file
 * (docs/review-workflow.md): `nimaime draft` writes `# status: draft`, `nimaime approve` rewrites
 * it to `# status: approved` (or removes it).
 *
 * Rewriting is byte-preserving: only the directive line changes; line breaks (LF, CRLF, CR), the
 * byte order mark and every other line are kept as they are.
 */
import { parse, type SpecStatus } from '../parser';

/** One line of a source text and the line break that ends it (`''` for the last line). */
interface SourceLine {
  text: string;
  eol: string;
}

const BOM = '\uFEFF';

/** Splits `body` into lines the way the parser counts them (LF, CRLF and a lone CR). */
function splitLines(body: string): SourceLine[] {
  const parts = body.split(/(\r\n|\r|\n)/);
  const lines: SourceLine[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push({ text: parts[i] ?? '', eol: parts[i + 1] ?? '' });
  }
  return lines;
}

/** The value part of a directive line (`# status: <value>`), with what surrounds it. */
const DIRECTIVE_LINE = /^(\s*#\s*status\s*:)(\s*)(.*?)(\s*)$/;

/** The directive's line (1-based) in the header of `source`, if it has one. */
export function statusDirectiveLine(source: string): number | undefined {
  return parse(source).document.statusDirective?.location.line;
}

/**
 * `source` with its status directive set to `status`: the first directive of the header is
 * rewritten in place, or, when there is none, `# status: <status>` is inserted as the first line.
 * `status` `undefined` removes the directive line (a file without the directive is approved).
 */
export function setStatusDirective(source: string, status: SpecStatus | undefined): string {
  const bom = source.startsWith(BOM) ? BOM : '';
  const lines = splitLines(source.slice(bom.length));
  const line = statusDirectiveLine(source);
  if (line === undefined) {
    if (status === undefined) return source;
    const eol = lines.find((l) => l.eol !== '')?.eol ?? '\n';
    const body = source.slice(bom.length);
    return `${bom}# status: ${status}${eol}${body}`;
  }
  const index = line - 1;
  const current = lines[index];
  if (current === undefined) return source;
  if (status === undefined) {
    lines.splice(index, 1);
  } else {
    lines[index] = {
      eol: current.eol,
      text: current.text.replace(
        DIRECTIVE_LINE,
        (_, head: string, space: string, _value: string, tail: string) =>
          `${head}${space === '' ? ' ' : space}${status}${tail}`,
      ),
    };
  }
  return bom + lines.map((l) => l.text + l.eol).join('');
}
