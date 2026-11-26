import { describe, expect, it } from "vitest";
import { elapsed, emptySession, reducer, type Session } from "./session";

const start = (over: Partial<Session> = {}): Session => ({ ...emptySession("2026-11-25"), ...over });

describe("timer", () => {
  it("adds up separate runs on one problem", () => {
    let s = reducer(start(), { type: "timer", id: "1", now: 0 });
    s = reducer(s, { type: "timer", id: "1", now: 60_000 });
    s = reducer(s, { type: "timer", id: "1", now: 100_000 });
    expect(elapsed(s, "1", 130_000)).toBe(90);
  });

  it("runs on one problem at a time", () => {
    let s = reducer(start(), { type: "timer", id: "1", now: 0 });
    s = reducer(s, { type: "timer", id: "21", now: 30_000 });
    expect(s.running?.id).toBe("21");
    expect(elapsed(s, "1", 90_000)).toBe(30);
  });

  it("stops when the running problem is graded", () => {
    let s = reducer(start(), { type: "timer", id: "1", now: 0 });
    s = reducer(s, { type: "grade", id: "1", grade: "good", now: 120_000 });
    expect(s.running).toBeUndefined();
    expect(elapsed(s, "1", 999_000)).toBe(120);
  });

  it("keeps running when another problem is graded", () => {
    let s = reducer(start(), { type: "timer", id: "1", now: 0 });
    s = reducer(s, { type: "grade", id: "21", grade: "good", now: 10_000 });
    expect(s.running?.id).toBe("1");
  });
});

describe("grades", () => {
  it("toggles off when the same grade is pressed again", () => {
    let s = reducer(start(), { type: "grade", id: "1", grade: "good", now: 0 });
    s = reducer(s, { type: "grade", id: "1", grade: "good", now: 0 });
    expect(s.grades).toEqual({});
  });

  it("moves graded problems to sent", () => {
    let s = reducer(start(), { type: "grade", id: "1", grade: "hard", now: 0 });
    s = reducer(s, { type: "send" });
    expect(s.grades).toEqual({});
    expect(s.sent).toEqual({ "1": "hard" });
  });
});

describe("a new plan", () => {
  const busy = start({
    grades: { "1": "good", "21": "hard" },
    sent: { "3": "easy" },
    spent: { "1": 300, "21": 60 },
    running: { id: "21", since: 0 },
  });

  it("keeps the work on problems it carries over and drops the rest", () => {
    const s = reducer(busy, { type: "open", date: "2026-11-26", ids: ["21", "49"] });
    expect(s).toEqual({
      date: "2026-11-26",
      grades: { "21": "hard" },
      sent: {},
      spent: { "21": 60 },
      running: { id: "21", since: 0 },
    });
  });

  it("changes nothing when the plan is the same", () => {
    expect(reducer(busy, { type: "open", date: "2026-11-25", ids: [] })).toBe(busy);
  });
});
