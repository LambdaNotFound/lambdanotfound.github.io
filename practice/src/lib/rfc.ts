// Pure parser for the Design tab: no DOM, no fetch, so Vitest covers it.
//
// It reads an RFC from the system-design repository (design-doc/<slug>/rfc.md)
// and sorts it into the six steps of a system design interview. It relies on
// the shape that repository's .claude/skills/new-design/rfc-spec.md fixes:
// the section names, the `| ID | Requirement |` tables, a bold label opening
// each non-functional requirement, the "The forcing question is ..." sentence,
// a `**Chosen:**` line opening each group under Alternatives Considered,
// `**Name.** Pro: ... Con: ...` bullets, and one bold bullet per failure mode.
// When that spec changes, change this file in the same piece of work.

export const DESIGNS_REPO = "LambdaNotFound/system-design";

/** Text in these blocks is inline Markdown: **bold**, `code`, [links](url), *italics*. */
export type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "code"; lang: string; text: string }
  | { kind: "mermaid"; text: string }
  | { kind: "pc"; pro: string; con: string };

export interface Section {
  title: string;
  blocks: Block[];
}

export interface Requirement {
  id: string;
  /** A non-functional requirement's bold label ("Write load"); empty for functional ones. */
  label: string;
  text: string;
}

export interface Alternative {
  name: string;
  pro: string;
  con: string;
  /** The sentence saying when this option would win instead ("It flips if ..."), or "". */
  flip: string;
}

export interface Decision {
  title: string;
  /** The `**Chosen:**` line, or "" for an RFC written before the spec asked for it. */
  chosen: string;
  alternatives: Alternative[];
  notes: Block[];
}

export interface Column {
  name: string;
  type: string;
  key: "" | "PK" | "UNIQUE";
  note: string;
}

export interface Entity {
  name: string;
  columns: Column[];
}

export interface FailureMode {
  name: string;
  text: string;
}

export interface Design {
  slug: string;
  title: string;
  status: string;
  /** The RFC on GitHub, at the commit the page was built from. */
  url: string;
  /** "How to keep both unique keys consistent ...", from the Problem Statement. */
  forcing: string;
  /** The Problem Statement's first sentence, for the list of designs. */
  summary: string;
  problem: Block[];
  terms: Block[];
  functional: Requirement[];
  nonFunctional: Requirement[];
  outOfScope: Block[];
  estimates: Block[];
  /** Step 2: the data model section, and the tables its SQL creates. */
  entities: Section | null;
  tables: Entity[];
  /** Step 3. */
  api: Section | null;
  /** Step 4: every solution subsection drawn as a sequence diagram, and the worked example. */
  flows: Section[];
  example: Section | null;
  /** Step 5: the overview with its architecture diagram, then the other components. */
  overview: Section | null;
  components: Section[];
  /** Step 6. */
  decisions: Decision[];
  failureModes: FailureMode[];
  failureNotes: Block[];
}

// --- document structure ---

interface Part {
  title: string;
  lines: string[];
}

interface Chapter extends Part {
  subs: Part[];
}

function splitDocument(md: string): { title: string; head: string[]; chapters: Chapter[] } {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let title = "";
  const head: string[] = [];
  const chapters: Chapter[] = [];
  let fence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) fence = !fence;
    const chapter = chapters.at(-1);
    const m = fence ? null : /^(#{1,3})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m && m[1] === "#" && !title) {
      title = m[2];
    } else if (m && m[1] === "##") {
      chapters.push({ title: m[2], lines: [], subs: [] });
    } else if (m && m[1] === "###" && chapter) {
      chapter.subs.push({ title: m[2], lines: [] });
    } else if (chapter) {
      (chapter.subs.at(-1) ?? chapter).lines.push(line);
    } else {
      head.push(line);
    }
  }
  return { title, head, chapters };
}

const same = (a: string, b: RegExp) => b.test(a.trim());

/** A chapter or a subsection by title, at either level, since Out of Scope may sit at both. */
function findPart(chapters: Chapter[], title: RegExp): Part | null {
  for (const c of chapters) {
    if (same(c.title, title)) return c;
    for (const s of c.subs) if (same(s.title, title)) return s;
  }
  return null;
}

/** A chapter's own lines plus its subsections, as one run of Markdown. */
function wholeChapter(c: Chapter): string[] {
  return [...c.lines, ...c.subs.flatMap((s) => [`**${s.title}.**`, "", ...s.lines])];
}

// --- blocks ---

const LIST_ITEM = /^([-*]|\d+[.)])\s+(.*)$/;
const PROS_CONS = /^\*\*Pros?:\*\*\s*(.*?)\s*\*\*Cons?:\*\*\s*(.*)$/s;

function splitRow(line: string): string[] {
  const cells = line
    .trim()
    .replace(/\\\|/g, "\u0000")
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|");
  return cells.map((c) => c.replace(/\u0000/g, "|").trim());
}

export function parseBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  const blank = (s: string | undefined) => s === undefined || s.trim() === "";
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line) || /^\s*<!--.*-->\s*$/.test(line)) {
      i++;
      continue;
    }
    const fence = /^\s*```\s*([\w-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      const text = body.join("\n");
      out.push(fence[1] === "mermaid" ? { kind: "mermaid", text } : { kind: "code", lang: fence[1], text });
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = splitRow(lines[i++]);
        if (!row.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(row);
      }
      out.push({ kind: "table", head: rows[0] ?? [], rows: rows.slice(1) });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        const top = LIST_ITEM.exec(cur);
        if (top && !/^\s/.test(cur)) {
          items.push(top[2].trim());
        } else if (!blank(cur) && /^\s+\S/.test(cur) && items.length) {
          // A wrapped line, or a nested item, continues the item above.
          items[items.length - 1] += " " + cur.trim().replace(LIST_ITEM, "$2");
        } else if (blank(cur) && LIST_ITEM.test(lines[i + 1] ?? "") && !/^\s/.test(lines[i + 1] ?? "")) {
          // A blank line between two items of one list.
        } else {
          break;
        }
        i++;
      }
      out.push({ kind: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      !blank(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !lines[i].trim().startsWith("|") &&
      !(para.length && LIST_ITEM.test(lines[i]))
    ) {
      para.push(lines[i++].trim().replace(/^#{4,6}\s+(.*)$/, "**$1**"));
    }
    const text = para.join(" ");
    const pc = PROS_CONS.exec(text);
    out.push(pc ? { kind: "pc", pro: pc[1], con: pc[2] } : { kind: "p", text });
  }
  return out;
}

// --- links ---

function joinPath(base: string, rel: string): string {
  const parts = base.split("/").filter(Boolean);
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

/** Points relative links at the file on GitHub, so they work from the page. */
export function absoluteLinks(text: string, dir: string, ref: string, rfcUrl: string): string {
  return text.replace(/(!?\[[^\]]*\]\()([^)\s]+)(\))/g, (_all, open: string, target: string, close: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return open + target + close;
    if (target.startsWith("#")) return open + rfcUrl + target + close;
    const [path, anchor = ""] = target.split("#");
    const url = `https://github.com/${DESIGNS_REPO}/blob/${ref}/${joinPath(dir, path)}${anchor ? "#" + anchor : ""}`;
    return open + url + close;
  });
}

function mapText(b: Block, f: (s: string) => string): Block {
  switch (b.kind) {
    case "p":
      return { ...b, text: f(b.text) };
    case "list":
      return { ...b, items: b.items.map(f) };
    case "table":
      return { ...b, head: b.head.map(f), rows: b.rows.map((r) => r.map(f)) };
    case "pc":
      return { ...b, pro: f(b.pro), con: f(b.con) };
    default:
      return b;
  }
}

// --- the parts ---

function requirements(part: Part | null, nonFunctional: boolean): Requirement[] {
  if (!part) return [];
  const table = parseBlocks(part.lines).find((b) => b.kind === "table");
  if (!table || table.kind !== "table") return [];
  return table.rows
    .filter((r) => /^N?FR\d+$/.test(r[0] ?? ""))
    .map(([id, text = ""]) => {
      const m = nonFunctional ? /^\*\*(.+?)\.?\*\*\s*(.*)$/.exec(text) : null;
      return m ? { id, label: m[1].replace(/\.$/, ""), text: m[2] } : { id, label: "", text };
    });
}

/** Splits "... costs two. The closest call here, it flips if ..." into the con and the flip. */
export function splitFlip(con: string): { con: string; flip: string } {
  const at = con.search(/\bflips if\b/i);
  if (at < 0) return { con, flip: "" };
  const before = con.slice(0, at);
  const sentenceStart = Math.max(...[...before.matchAll(/[.!?]\s+/g)].map((m) => (m.index ?? 0) + m[0].length), 0);
  const semi = before.lastIndexOf(";");
  let cut = sentenceStart;
  let flipStart = sentenceStart;
  if (semi >= sentenceStart) {
    cut = semi;
    flipStart = semi + 1;
  }
  const rest = con.slice(0, cut).trim().replace(/[;,]$/, "");
  if (!rest) return { con, flip: "" };
  const flip = con.slice(flipStart).trim();
  return {
    con: /[.!?]$/.test(rest) ? rest : rest + ".",
    flip: flip.charAt(0).toUpperCase() + flip.slice(1),
  };
}

const ALTERNATIVE = /^\*\*(.+?)\*\*\s*Pro:\s*(.*?)\s+Con:\s*(.*)$/s;
const CHOSEN = /^\*\*Chosen:\*\*\s*(.*)$/s;

function decision(title: string, lines: string[]): Decision {
  const d: Decision = { title, chosen: "", alternatives: [], notes: [] };
  for (const b of parseBlocks(lines)) {
    const chosen = b.kind === "p" ? CHOSEN.exec(b.text) : null;
    if (chosen) {
      d.chosen = chosen[1].charAt(0).toUpperCase() + chosen[1].slice(1);
      continue;
    }
    if (b.kind === "list") {
      const rest: string[] = [];
      for (const item of b.items) {
        const m = ALTERNATIVE.exec(item);
        if (m) d.alternatives.push({ name: m[1].replace(/\.$/, ""), pro: m[2], ...splitFlip(m[3]) });
        else rest.push(item);
      }
      if (rest.length) d.notes.push({ ...b, items: rest });
      continue;
    }
    d.notes.push(b);
  }
  return d;
}

/** The tables a `CREATE TABLE` sketch makes, with each column's key and comment. */
export function parseTables(sql: string): Entity[] {
  const out: Entity[] = [];
  for (const m of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([\w.]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
    const columns: Column[] = [];
    const keyed: Record<string, Column["key"]> = {};
    for (const raw of m[2].split("\n")) {
      const [code, note = ""] = raw.split(/--(.*)/s);
      const line = code.trim().replace(/,$/, "");
      if (!line) continue;
      const constraint = /^(?:CONSTRAINT\s+\w+\s+)?(PRIMARY KEY|UNIQUE(?:\s+INDEX)?(?:\s+\w+)?)\s*\(([^)]*)\)/i.exec(line);
      if (constraint) {
        const key = /^PRIMARY/i.test(constraint[1]) ? "PK" : "UNIQUE";
        for (const c of constraint[2].split(",")) keyed[c.trim()] = key;
        continue;
      }
      if (/^(INDEX|FOREIGN KEY|CHECK|FAMILY)\b/i.test(line)) continue;
      const col = /^([\w"]+)\s+([A-Za-z][\w ]*?(?:\([^)]*\))?(?:\[\])?)(?=\s|$)(.*)$/.exec(line);
      if (!col) continue;
      const rest = col[3];
      columns.push({
        name: col[1].replace(/"/g, ""),
        type: col[2],
        key: /PRIMARY KEY/i.test(rest) ? "PK" : /\bUNIQUE\b/i.test(rest) ? "UNIQUE" : "",
        note: note.trim(),
      });
    }
    for (const c of columns) if (!c.key && keyed[c.name]) c.key = keyed[c.name];
    if (columns.length) out.push({ name: m[1], columns });
  }
  return out;
}

const isSequence = (b: Block) => b.kind === "mermaid" && /^\s*(%%.*\n\s*)*sequenceDiagram\b/.test(b.text);

/** Everything the Design tab shows for one RFC. `ref` is the system-design commit, or "main". */
export function parseRfc(md: string, slug: string, ref = "main"): Design {
  const dir = `design-doc/${slug}`;
  const url = `https://github.com/${DESIGNS_REPO}/blob/${ref}/${dir}/rfc.md`;
  const fix = (s: string) => absoluteLinks(s, dir, ref, url);
  const blocks = (lines: string[]) => parseBlocks(lines).map((b) => mapText(b, fix));
  const section = (p: Part): Section => ({ title: p.title, blocks: blocks(p.lines) });

  const { title, head, chapters } = splitDocument(md);
  const chapter = (re: RegExp) => chapters.find((c) => same(c.title, re)) ?? null;
  const status = /\*\*Status:\*\*\s*([^·\n|]+)/.exec(head.join("\n"))?.[1].trim() ?? "";

  // The forcing question is one sentence in the Problem Statement; the rest says why it is hard.
  const problemChapter = chapter(/^problem statement$/i);
  let forcing = "";
  const problem: Block[] = [];
  for (const b of problemChapter ? blocks(wholeChapter(problemChapter)) : []) {
    const m = b.kind === "p" ? /(?:^|\.\s+)The forcing question is (.+?)\.?$/.exec(b.text) : null;
    if (m && b.kind === "p") {
      forcing = m[1].charAt(0).toUpperCase() + m[1].slice(1) + (/[?.]$/.test(m[1]) ? "" : ".");
      const before = b.text.slice(0, m.index + (m[0].startsWith(".") ? 1 : 0)).trim();
      if (before) problem.push({ kind: "p", text: before });
    } else {
      problem.push(b);
    }
  }
  const first = problem.find((b) => b.kind === "p");
  const summary = first && first.kind === "p" ? (/^.*?[.!?](?=\s|$)/.exec(first.text)?.[0] ?? first.text) : "";

  const estimatesChapter = chapter(/^estimates$/i);
  const termsChapter = chapter(/^terminolog/i);
  const outOfScope = findPart(chapters, /^out of scope$/i);

  // Proposed Solution: each subsection goes to the step it serves.
  const solution = chapter(/^proposed solution$/i);
  let overview: Section | null = null;
  let api: Section | null = null;
  let entities: Section | null = null;
  let example: Section | null = null;
  const flows: Section[] = [];
  const components: Section[] = [];
  for (const sub of solution?.subs ?? []) {
    const s = section(sub);
    if (/^overview$/i.test(sub.title)) overview = s;
    else if (/^api\b/i.test(sub.title)) api = s;
    else if (/^data model/i.test(sub.title)) entities = s;
    else if (/^example/i.test(sub.title)) example = s;
    else if (s.blocks.some(isSequence)) flows.push(s);
    else components.push(s);
  }
  if (solution && !overview && solution.lines.some((l) => l.trim())) {
    overview = { title: "Overview", blocks: blocks(solution.lines) };
  }
  const tables = entities
    ? entities.blocks.flatMap((b) => (b.kind === "code" && /CREATE TABLE/i.test(b.text) ? parseTables(b.text) : []))
    : [];

  // Alternatives Considered: one decision per subsection.
  const alternatives = chapter(/^alternatives considered$/i);
  const decisions = alternatives
    ? alternatives.subs.length
      ? alternatives.subs.map((s) => decision(s.title, s.lines))
      : [decision("Alternatives", alternatives.lines)]
    : [];
  for (const d of decisions) {
    d.chosen = fix(d.chosen);
    d.alternatives = d.alternatives.map((a) => ({ name: fix(a.name), pro: fix(a.pro), con: fix(a.con), flip: fix(a.flip) }));
    d.notes = d.notes.map((b) => mapText(b, fix));
  }

  // Failure modes: the first list of bold-led bullets; everything else is how to watch them.
  const failure = chapter(/^failure modes/i);
  const failureModes: FailureMode[] = [];
  const failureNotes: Block[] = [];
  for (const b of failure ? blocks(wholeChapter(failure)) : []) {
    const all = b.kind === "list" && !failureModes.length ? b.items.map((t) => /^\*\*(.+?)\*\*\s*(.*)$/.exec(t)) : [];
    if (all.length && all.every(Boolean)) {
      for (const m of all) failureModes.push({ name: m![1].replace(/\.$/, ""), text: m![2] });
    } else {
      failureNotes.push(b);
    }
  }

  return {
    slug,
    title: title.replace(/^RFC:\s*/i, "").trim() || slug,
    status,
    url,
    forcing,
    summary,
    problem,
    terms: termsChapter ? blocks(wholeChapter(termsChapter)) : [],
    functional: requirements(findPart(chapters, /^functional requirements$/i), false).map((r) => ({ ...r, text: fix(r.text) })),
    nonFunctional: requirements(findPart(chapters, /^non-functional requirements$/i), true).map((r) => ({ ...r, text: fix(r.text) })),
    outOfScope: outOfScope ? blocks(outOfScope.lines) : [],
    estimates: estimatesChapter ? blocks(wholeChapter(estimatesChapter)) : [],
    entities,
    tables,
    api,
    flows,
    example,
    overview,
    components,
    decisions,
    failureModes,
    failureNotes,
  };
}

/** The slug in a path such as "../../designs-src/design-doc/url-shortener/rfc.md". */
export function slugOf(path: string): string {
  return /design-doc\/([^/]+)\/rfc\.md$/.exec(path)?.[1] ?? path;
}

// --- inline Markdown, as tokens the page turns into elements ---

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; v: Inline[] }
  | { t: "i"; v: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; v: string; href: string }
  | { t: "req"; v: string };

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|!?\[([^\]]+)\]\(([^)\s]+)\)|\b(N?FR\d{1,3})\b|(?<![\w*])\*(?!\s)([^*]+?)\*(?![\w*])/g;

/** Splits inline Markdown into tokens. `known` decides which FR/NFR ids become chips. */
export function inline(text: string, known: (id: string) => boolean = () => true): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: "text", v: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ t: "b", v: inline(m[1], known) });
    else if (m[2] !== undefined) out.push({ t: "code", v: m[2] });
    else if (m[3] !== undefined) out.push({ t: "link", v: m[3], href: m[4] });
    else if (m[5] !== undefined) out.push(known(m[5]) ? { t: "req", v: m[5] } : { t: "text", v: m[5] });
    else if (m[6] !== undefined) out.push({ t: "i", v: inline(m[6], known) });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

/** The text of the first sentence, for card summaries; the rest is shown on request. */
export function firstSentence(text: string): { head: string; tail: string } {
  const m = /^(.*?[.!?])(\s+)(?=[A-Z`*(])/s.exec(text);
  return m ? { head: m[1], tail: text.slice(m[0].length) } : { head: text, tail: "" };
}
