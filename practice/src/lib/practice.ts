// Pure logic for the practice page: no DOM, no fetch, so Vitest covers it.
//
// The plan itself is picked by sr.py in the GoCode repo, once a day, usually
// between midnight and 4 AM Pacific, and recorded in state.json. This page only reads that file:
// it shows the latest plan, and logs grades by opening a GitHub issue that
// GoCode's log-solve workflow turns into `sr.py log` calls. The issue is
// either prefilled for the viewer to submit, or, with a token the viewer
// saved, created straight through GitHub's API.

export const REPO = "LambdaNotFound/GoCode";

export type Grade = "again" | "hard" | "good" | "easy";
export const GRADES: Grade[] = ["again", "hard", "good", "easy"];

export type Difficulty = "E" | "M" | "H";
export const DIFFICULTY_NAME: Record<Difficulty, string> = {
  E: "Easy",
  M: "Medium",
  H: "Hard",
};

export interface Problem {
  id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  url: string;
  category: string;
}

export interface Card {
  due: string;
  interval: number;
  last: string;
}

export interface Plan {
  review: string[];
  new: string[];
}

export interface LogEntry {
  date: string;
  id: string;
  grade: Grade;
  // The card and deferral before this log, which `sr.py undo` restores.
  // Entries logged before 11-25-2026 have none.
  prev?: { card: Card | null; deferred: unknown };
}

export interface State {
  cards: Record<string, Card>;
  served: Record<string, Plan>;
  log: LogEntry[];
  paused?: { since: string };
}

// --- dates (YYYY-MM-DD strings, the same form state.json uses) ---

/** The Pacific date and hour, which is the clock sr.py plans by. */
export function pacificNow(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

const DAY_MS = 86_400_000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);

export function addDays(date: string, n: number): string {
  return new Date(utc(date) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

/** "Wed, Nov 25" */
export function formatDate(date: string): string {
  return new Date(utc(date)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// --- what to show ---

export type View =
  | { kind: "paused"; since: string }
  | { kind: "empty" }
  | { kind: "plan"; date: string; plan: Plan; isToday: boolean };

/** The newest plan up to today, or why there is none. */
export function pickView(state: State, today: string): View {
  if (state.paused) return { kind: "paused", since: state.paused.since };
  const dates = Object.keys(state.served).filter((d) => d <= today).sort();
  const date = dates.at(-1);
  if (!date) return { kind: "empty" };
  return { kind: "plan", date, plan: state.served[date], isToday: date === today };
}

/** The latest log of a problem on or after a plan's date. */
export function loggedSince(state: State, id: string, since: string): LogEntry | undefined {
  let hit: LogEntry | undefined;
  for (const e of state.log) {
    if (e.id === id && e.date >= since && (!hit || e.date >= hit.date)) hit = e;
  }
  return hit;
}

// --- logging ---

/** Lines like "53 good", in plan order, which sr.parse_solves reads. */
export function slipLines(order: string[], grades: Record<string, Grade>): string[] {
  return order.filter((id) => grades[id]).map((id) => `${id} ${grades[id]}`);
}

/**
 * A prefilled new-issue link. log-solve.yml logs an issue whose title starts
 * with "Practice log" when the repository owner opens it.
 */
export function logIssueUrl(date: string, body: string): string {
  const q = (s: string) => encodeURIComponent(s);
  return `https://github.com/${REPO}/issues/new?title=${q(`Practice log ${date}`)}&body=${q(body)}`;
}

/**
 * The same log issue, created through GitHub's API with the viewer's token:
 * one tap instead of a trip to GitHub's form. The issue is opened as the
 * token's owner, which is what log-solve.yml checks.
 */
export function logIssueRequest(date: string, body: string, token: string): { url: string; init: RequestInit } {
  return {
    url: `https://api.github.com/repos/${REPO}/issues`,
    init: {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: `Practice log ${date}`, body }),
    },
  };
}

/** What to tell the viewer when GitHub refuses that request. */
export function logIssueError(status: number): string {
  if (status === 401) return "GitHub didn't accept the token. Forget it and save a new one.";
  if (status === 403 || status === 404) {
    return "The token can't open issues in GoCode. It needs Issues: Read and write on that repository.";
  }
  return `GitHub answered ${status}. Use Log on GitHub instead.`;
}

// --- memory board ---

/**
 * Estimated share remembered: 90% on the day a review falls due, then
 * fading on the same curve. A model for shading, not a measurement.
 */
export function retention(card: Card, date: string): number {
  const elapsed = Math.max(0, daysBetween(card.last, date));
  return Math.pow(0.9, elapsed / Math.max(1, card.interval));
}

/** Tile opacity: anything under 30% remembered is all but blank. */
export function inkAlpha(r: number): number {
  return Math.max(0.06, Math.min(1, (r - 0.3) / 0.7));
}

export function servedIds(state: State): Set<string> {
  const out = new Set<string>();
  for (const plan of Object.values(state.served)) {
    for (const id of [...plan.review, ...plan.new]) out.add(id);
  }
  return out;
}

/** Categories, largest first, each with its problems in deck order. */
export function byCategory(problems: Problem[]): [string, Problem[]][] {
  const groups = new Map<string, Problem[]>();
  for (const p of problems) {
    const list = groups.get(p.category) ?? [];
    list.push(p);
    groups.set(p.category, list);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length);
}

// --- links to the user's own solutions ---

/**
 * Maps a problem slug to the solution files that GoCode's README index links
 * for it, in column order (Go, Python, Rust). Rows look like:
 *   | Tag | 1. Two Sum | [..](https://<site>/problems/two-sum/) | [go](go/dsa/x.go#L6) | [py](python/dsa/x.py#L7) | [rs](rust/dsa/x.rs#L7) |
 */
export function parseSolutions(readme: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of readme.split("\n")) {
    const cells = line.split("|");
    const at = cells.findIndex((c) => /\/problems\/[a-z0-9-]+/.test(c));
    if (at < 0) continue;
    const slug = cells[at].match(/\/problems\/([a-z0-9-]+)/)![1];
    const paths = cells
      .slice(at + 1)
      .flatMap((c) => [...c.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]))
      .filter((p) => !/^[a-z]+:/i.test(p));
    if (paths.length && !out.has(slug)) out.set(slug, paths);
  }
  return out;
}

export function sourceUrl(path: string): string {
  return `https://github.com/${REPO}/blob/main/${path}`;
}
