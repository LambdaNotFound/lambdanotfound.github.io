// What the viewer has done on this page for the plan on screen: grades
// chosen, grades sent to GitHub, and time spent. Kept in localStorage, so it
// belongs to this browser only and survives a reload, nothing more.

import type { Grade } from "./practice";

export interface Session {
  date: string; // the plan these belong to
  grades: Record<string, Grade>; // chosen, not sent yet
  sent: Record<string, Grade>; // sent, until state.json shows them logged
  spent: Record<string, number>; // seconds, finished timer runs only
  running?: { id: string; since: number }; // epoch ms
}

export type Action =
  | { type: "open"; date: string; ids: string[] }
  | { type: "grade"; id: string; grade: Grade; now: number }
  | { type: "timer"; id: string; now: number }
  | { type: "send" };

export const emptySession = (date: string): Session => ({ date, grades: {}, sent: {}, spent: {} });

/** Seconds spent on a problem, counting a timer that is still running. */
export function elapsed(s: Session, id: string, now: number): number {
  const live = s.running?.id === id ? (now - s.running.since) / 1000 : 0;
  return (s.spent[id] ?? 0) + Math.max(0, live);
}

function stopTimer(s: Session, now: number): Session {
  if (!s.running) return s;
  const { id } = s.running;
  return { ...s, spent: { ...s.spent, [id]: elapsed(s, id, now) }, running: undefined };
}

const pick = <T,>(rec: Record<string, T>, ids: string[]) =>
  Object.fromEntries(Object.entries(rec).filter(([id]) => ids.includes(id)));

export function reducer(s: Session, a: Action): Session {
  switch (a.type) {
    case "open": {
      // A new plan keeps what was done on problems it carries over.
      if (s.date === a.date) return s;
      const running = s.running && a.ids.includes(s.running.id) ? s.running : undefined;
      return {
        date: a.date,
        grades: pick(s.grades, a.ids),
        sent: pick(s.sent, a.ids),
        spent: pick(s.spent, a.ids),
        running,
      };
    }
    case "grade": {
      const grades = { ...s.grades };
      if (grades[a.id] === a.grade) delete grades[a.id];
      else grades[a.id] = a.grade;
      const next = { ...s, grades };
      // Grading what the clock is on means the attempt is over.
      return s.running?.id === a.id ? stopTimer(next, a.now) : next;
    }
    case "timer": {
      const wasRunning = s.running?.id === a.id;
      const stopped = stopTimer(s, a.now);
      return wasRunning ? stopped : { ...stopped, running: { id: a.id, since: a.now } };
    }
    case "send":
      return { ...s, sent: { ...s.sent, ...s.grades }, grades: {} };
  }
}

const KEY = "daily-practice:session";

function isSession(x: unknown): x is Session {
  const s = x as Session;
  return (
    !!s && typeof s.date === "string" &&
    [s.grades, s.sent, s.spent].every((r) => !!r && typeof r === "object")
  );
}

export function loadSession(): Session | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private windows and blocked storage: the page still works, it just forgets.
  }
}

// A GitHub token for one-tap logging, if the viewer saved one. Like the
// session it stays in this browser only, so anyone using this browser can
// log with it; the setup text says so.
const TOKEN_KEY = "daily-practice:token";

export function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Blocked storage: the token lasts until the page is closed.
  }
}
