import { describe, expect, it } from "vitest";
import { emptySession, reducer, toSession, type Session } from "./session";

const start = (over: Partial<Session> = {}): Session => ({ ...emptySession("2026-11-25"), ...over });

describe("grades", () => {
  it("toggles off when the same grade is pressed again", () => {
    let s = reducer(start(), { type: "grade", id: "1", grade: "good" });
    s = reducer(s, { type: "grade", id: "1", grade: "good" });
    expect(s.grades).toEqual({});
  });

  it("moves graded problems to sent", () => {
    let s = reducer(start(), { type: "grade", id: "1", grade: "hard" });
    s = reducer(s, { type: "send" });
    expect(s.grades).toEqual({});
    expect(s.sent).toEqual({ "1": "hard" });
  });
});

describe("a new plan", () => {
  const busy = start({
    grades: { "1": "good", "21": "hard" },
    sent: { "3": "easy" },
  });

  it("keeps the work on problems it carries over and drops the rest", () => {
    const s = reducer(busy, { type: "open", date: "2026-11-26", ids: ["21", "49"] });
    expect(s).toEqual({ date: "2026-11-26", grades: { "21": "hard" }, sent: {} });
  });

  it("changes nothing when the plan is the same", () => {
    expect(reducer(busy, { type: "open", date: "2026-11-25", ids: [] })).toBe(busy);
  });
});

describe("a stored session", () => {
  it("drops the timer fields older versions saved", () => {
    const old = { date: "2026-11-25", grades: { "1": "good" }, sent: {}, spent: { "1": 300 }, running: { id: "1", since: 0 } };
    expect(toSession(old)).toEqual({ date: "2026-11-25", grades: { "1": "good" }, sent: {} });
  });

  it("rejects anything else", () => {
    for (const x of [null, 3, { date: "2026-11-25" }, { date: 1, grades: {}, sent: {} }]) expect(toSession(x)).toBeNull();
  });
});
