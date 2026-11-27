// Cuts one problem's solution out of a GoCode source file, for the "Show
// code" panel. Pure, like practice.ts, so Vitest covers it.
//
// GoCode's README links each problem to a line, normally the problem's
// header inside a comment (`/** ... * 1. Two Sum ... */` in Go, a docstring
// before the method in Python). The snippet is that whole comment, then the
// code after it, up to the next comment at the same level: the next
// problem's header, or a note before an alternative version.

export type Lang = "go" | "python" | "rust";

export const LANG_NAME: Record<Lang, string> = { go: "Go", python: "Python", rust: "Rust" };

export interface SourceRef {
  path: string; // repo-relative, without the anchor
  line: number; // 1-based; 0 when the link has no #L anchor
  lang: Lang;
}

/** "go/dsa/x.go#L6" from the README, or undefined for a file type it can't show. */
export function parseSourceRef(link: string): SourceRef | undefined {
  const m = link.match(/^([^#]+?)(?:#L(\d+))?$/);
  if (!m) return undefined;
  const lang = langOf(m[1]);
  return lang && { path: m[1], line: m[2] ? Number(m[2]) : 0, lang };
}

function langOf(path: string): Lang | undefined {
  if (path.endsWith(".go")) return "go";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".rs")) return "rust";
  return undefined;
}

export interface Snippet {
  code: string;
  first: number; // 1-based line numbers in the file
  last: number;
}

const indent = (s: string) => s.length - s.trimStart().length;
const blank = (s: string) => s.trim() === "";

/**
 * For each line, the index of the line that opens the block comment (Go,
 * Rust) or docstring (Python) it sits in, or -1 outside one.
 */
function blockStarts(lines: string[], lang: Lang): number[] {
  const out: number[] = [];
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    if (lang === "python") {
      const quotes = (s.match(/"""|'''/g) ?? []).length;
      const start = open;
      if (quotes % 2 === 1) open = open < 0 ? i : -1;
      out.push(start >= 0 ? start : open >= 0 ? open : quotes > 0 && s.trimStart().startsWith('"""') ? i : -1);
    } else {
      const t = s.trimStart();
      if (open < 0 && t.startsWith("/*")) open = i;
      out.push(open);
      if (open >= 0 && s.includes("*/")) open = -1;
    }
  }
  return out;
}

/** A line that starts a comment: a header, a note, or a doc comment. */
function opensComment(s: string, lang: Lang): boolean {
  const t = s.trimStart();
  return lang === "python"
    ? t.startsWith('"""') || t.startsWith("'''") || t.startsWith("#")
    : t.startsWith("/*") || t.startsWith("//");
}

/**
 * What ends a snippet, at the header's own indentation: any block comment
 * or docstring, or a line comment that names a problem (`// 20. Valid
 * Parentheses`). Other line comments are doc comments on the code that
 * belongs to this problem, such as the methods of a design problem.
 */
function endsSnippet(s: string, startsBlock: boolean, lang: Lang): boolean {
  if (!opensComment(s, lang)) return false;
  return startsBlock || /^\s*(\/\/|#)\s*\d{1,4}\.\s+\S/.test(s);
}

/** One problem's code, from the README's anchor line. */
export function extractSnippet(source: string, line: number, lang: Lang): Snippet {
  const lines = source.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  // A link to line 1 names no header (a whole-file solution): show it all.
  if (line <= 1) return { code: lines.join("\n"), first: 1, last: lines.length };
  const blocks = blockStarts(lines, lang);
  const at = Math.min(line, lines.length) - 1;

  // Start at the top of the comment the anchor is in, and take in comment
  // lines right above it (the rest of a `//` run).
  let first = blocks[at] >= 0 ? blocks[at] : at;
  while (first > 0 && !blank(lines[first - 1])) {
    const above = first - 1;
    if (blocks[above] >= 0) first = blocks[above];
    else if (opensComment(lines[above], lang)) first = above;
    else break;
  }

  // Then through the header and the code after it, until the next comment
  // that ends a snippet, or code that is less indented (the class ended).
  const base = indent(lines[first]);
  let seenCode = false;
  let end = lines.length;
  for (let i = first; i < lines.length; i++) {
    const s = lines[i];
    if (blank(s) || (blocks[i] >= 0 && blocks[i] !== i)) continue; // inside a comment
    if (seenCode && (indent(s) < base || (indent(s) === base && endsSnippet(s, blocks[i] === i, lang)))) {
      end = i;
      break;
    }
    if (indent(s) > base || !opensComment(s, lang)) seenCode = true;
  }
  let last = end - 1;
  while (last > first && blank(lines[last])) last--;
  return { code: dedent(lines.slice(first, last + 1)).join("\n"), first: first + 1, last: last + 1 };
}

function dedent(lines: string[]): string[] {
  const cut = Math.min(...lines.filter((s) => !blank(s)).map(indent));
  return cut > 0 && Number.isFinite(cut) ? lines.map((s) => s.slice(cut)) : lines;
}

/**
 * The page never shows the site's name (see CLAUDE.md), and a few solution
 * comments mention it, so the snippet abbreviates it.
 */
export function maskSiteName(code: string): string {
  return code.replace(/leetcode/gi, "LC");
}
