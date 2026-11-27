import { describe, expect, it } from "vitest";
import {
  addDays,
  byCategory,
  daysBetween,
  inkAlpha,
  logIssueError,
  logIssueRequest,
  logIssueUrl,
  loggedSince,
  pacificNow,
  parseSolutions,
  pickView,
  retention,
  slipLines,
  type Problem,
  type State,
} from "./practice";

const state = (over: Partial<State> = {}): State => ({
  cards: {},
  served: {},
  log: [],
  ...over,
});

describe("pacificNow", () => {
  it("uses the Pacific date, not UTC", () => {
    // 02:30 UTC on Nov 26 is still 6:30 PM on Nov 25 in Los Angeles.
    expect(pacificNow(new Date("2026-11-26T02:30:00Z"))).toEqual({ date: "2026-11-25", hour: 18 });
  });

  it("follows daylight saving time", () => {
    expect(pacificNow(new Date("2026-07-01T22:00:00Z"))).toEqual({ date: "2026-07-01", hour: 15 });
    expect(pacificNow(new Date("2026-12-01T22:00:00Z"))).toEqual({ date: "2026-12-01", hour: 14 });
  });

  it("reports midnight as hour 0", () => {
    expect(pacificNow(new Date("2026-11-25T08:00:00Z")).hour).toBe(0);
  });
});

describe("dates", () => {
  it("adds days across months and leap days", () => {
    expect(addDays("2026-11-25", 7)).toBe("2026-12-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("counts days in both directions", () => {
    expect(daysBetween("2026-08-26", "2026-11-25")).toBe(91);
    expect(daysBetween("2026-11-25", "2026-11-20")).toBe(-5);
  });
});

describe("pickView", () => {
  const plan = { review: ["1"], new: ["53"] };

  it("shows today's plan when the bot has run", () => {
    const s = state({ served: { "2026-11-24": plan, "2026-11-25": plan } });
    expect(pickView(s, "2026-11-25")).toEqual({ kind: "plan", date: "2026-11-25", plan, isToday: true });
  });

  it("falls back to the newest earlier plan before it has", () => {
    const s = state({ served: { "2026-11-21": plan, "2026-11-24": plan } });
    expect(pickView(s, "2026-11-25")).toMatchObject({ date: "2026-11-24", isToday: false });
  });

  it("ignores plans dated after today", () => {
    const s = state({ served: { "2026-11-24": plan, "2026-11-26": plan } });
    expect(pickView(s, "2026-11-25")).toMatchObject({ date: "2026-11-24" });
  });

  it("says when plans are paused", () => {
    const s = state({ served: { "2026-11-24": plan }, paused: { since: "2026-11-20" } });
    expect(pickView(s, "2026-11-25")).toEqual({ kind: "paused", since: "2026-11-20" });
  });

  it("handles a state with no plans", () => {
    expect(pickView(state(), "2026-11-25")).toEqual({ kind: "empty" });
  });
});

describe("loggedSince", () => {
  const s = state({
    log: [
      { date: "2026-11-20", id: "1", grade: "again" },
      { date: "2026-11-25", id: "1", grade: "good" },
      { date: "2026-11-26", id: "1", grade: "easy" },
      { date: "2026-11-25", id: "21", grade: "hard" },
    ],
  });

  it("returns the latest log on or after the plan date", () => {
    expect(loggedSince(s, "1", "2026-11-25")?.grade).toBe("easy");
    expect(loggedSince(s, "21", "2026-11-25")?.grade).toBe("hard");
  });

  it("ignores logs from before the plan", () => {
    expect(loggedSince(s, "1", "2026-11-27")).toBeUndefined();
    expect(loggedSince(s, "3", "2026-11-01")).toBeUndefined();
  });
});

describe("logging", () => {
  it("writes one line per graded problem, in plan order", () => {
    expect(slipLines(["1", "21", "53"], { "53": "good", "1": "hard" })).toEqual(["1 hard", "53 good"]);
  });

  it("builds a new-issue link the log workflow accepts", () => {
    const url = new URL(logIssueUrl("2026-11-25", "1 hard\n53 good"));
    expect(url.origin + url.pathname).toBe("https://github.com/LambdaNotFound/GoCode/issues/new");
    expect(url.searchParams.get("title")).toBe("Practice log 2026-11-25");
    expect(url.searchParams.get("body")).toBe("1 hard\n53 good");
    // %20, not "+": a "+" would reach GitHub as a literal plus in some paths.
    expect(url.search).not.toContain("+");
  });

  it("creates the same log issue through the API with a token", () => {
    const { url, init } = logIssueRequest("2026-11-25", "1 hard\n53 good", "tok");
    expect(url).toBe("https://api.github.com/repos/LambdaNotFound/GoCode/issues");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Practice log 2026-11-25", body: "1 hard\n53 good" });
  });

  it("explains a refused API request", () => {
    expect(logIssueError(401)).toMatch(/token/);
    expect(logIssueError(403)).toMatch(/Issues: Read and write/);
    expect(logIssueError(404)).toMatch(/Issues: Read and write/);
    expect(logIssueError(502)).toMatch(/502.*Log on GitHub/);
    for (const s of [401, 403, 502]) expect(logIssueError(s)).not.toMatch(/leetcode/i);
  });
});

describe("memory board", () => {
  const card = { due: "2026-11-30", interval: 10, last: "2026-11-20" };

  it("is 90% on the due day and fades on the same curve", () => {
    expect(retention(card, "2026-11-20")).toBe(1);
    expect(retention(card, "2026-11-30")).toBeCloseTo(0.9);
    expect(retention(card, "2026-12-10")).toBeCloseTo(0.81);
  });

  it("treats a zero interval as one day", () => {
    expect(retention({ ...card, interval: 0 }, "2026-11-21")).toBeCloseTo(0.9);
  });

  it("maps retention to ink, never fully blank", () => {
    expect(inkAlpha(1)).toBe(1);
    expect(inkAlpha(0.65)).toBeCloseTo(0.5);
    expect(inkAlpha(0.1)).toBe(0.06);
  });

  it("groups problems by category, largest first", () => {
    const p = (id: string, category: string): Problem =>
      ({ id, category, title: id, slug: id, difficulty: "E", url: "" });
    const groups = byCategory([p("1", "Array"), p("2", "Graph"), p("3", "Graph")]);
    expect(groups.map(([c, ps]) => [c, ps.map((x) => x.id)])).toEqual([
      ["Graph", ["2", "3"]],
      ["Array", ["1"]],
    ]);
  });
});

describe("parseSolutions", () => {
  const readme = [
    "| Tag | Problem | Link | Go | Python |",
    "|---|---|---|---|---|",
    "| Hash Table | 1. Two Sum | [L](https://example.com/problems/two-sum/) | [hashmap.go](golang/hashmap/hashmap.go#L6) | [hashmap.py](python/hashmap/hashmap.py#L7) |",
    "| Array | 1. Two Sum | [L](https://example.com/problems/two-sum/) | [other.go](golang/array/other.go#L1) | |",
    "| Stack | 20. Valid Parentheses | [L](https://example.com/problems/valid-parentheses/) | | [stack.py](python/stack_queue/stack.py#L3) |",
    "| Tree | 100. Same Tree | [L](https://example.com/problems/same-tree/) | | |",
  ].join("\n");
  const map = parseSolutions(readme);

  it("keeps each problem's first row, Go before Python", () => {
    expect(map.get("two-sum")).toEqual(["golang/hashmap/hashmap.go#L6", "python/hashmap/hashmap.py#L7"]);
    expect(map.get("valid-parentheses")).toEqual(["python/stack_queue/stack.py#L3"]);
  });

  it("reads a Rust column after Python", () => {
    const row = "| Hash Table | 1. Two Sum | [L](https://example.com/problems/two-sum/) | [a](go/dsa/h.go#L6) | [b](python/dsa/h.py#L7) | [c](rust/dsa/h.rs#L7) |";
    expect(parseSolutions(row).get("two-sum")).toEqual(["go/dsa/h.go#L6", "python/dsa/h.py#L7", "rust/dsa/h.rs#L7"]);
  });

  it("skips rows without a solution and non-table text", () => {
    expect(map.has("same-tree")).toBe(false);
    expect(map.size).toBe(2);
  });
});
