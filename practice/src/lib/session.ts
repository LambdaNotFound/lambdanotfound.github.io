// What the viewer has done on this page for the plan on screen: grades
// chosen and grades sent to GitHub. Kept in localStorage, so it belongs to
// this browser only and survives a reload, nothing more.

import type { Grade } from "./practice";

export interface Session {
  date: string; // the plan these belong to
  grades: Record<string, Grade>; // chosen, not sent yet
  sent: Record<string, Grade>; // sent, until state.json shows them logged
}

export type Action =
  | { type: "open"; date: string; ids: string[] }
  | { type: "grade"; id: string; grade: Grade }
  | { type: "send" }
  | { type: "unsend"; id: string };

export const emptySession = (date: string): Session => ({ date, grades: {}, sent: {} });

const pick = <T,>(rec: Record<string, T>, ids: string[]) =>
  Object.fromEntries(Object.entries(rec).filter(([id]) => ids.includes(id)));

export function reducer(s: Session, a: Action): Session {
  switch (a.type) {
    case "open":
      // A new plan keeps what was done on problems it carries over.
      if (s.date === a.date) return s;
      return { date: a.date, grades: pick(s.grades, a.ids), sent: pick(s.sent, a.ids) };
    case "grade": {
      const grades = { ...s.grades };
      if (grades[a.id] === a.grade) delete grades[a.id];
      else grades[a.id] = a.grade;
      return { ...s, grades };
    }
    case "send":
      return { ...s, sent: { ...s.sent, ...s.grades }, grades: {} };
    case "unsend": {
      // Back to graded, with the grade it was sent with: the GitHub form
      // may have been closed unsubmitted, or the grade may need changing.
      // A later log of the same problem that day replaces the first.
      const { [a.id]: grade, ...sent } = s.sent;
      if (!grade) return s;
      return { ...s, sent, grades: { ...s.grades, [a.id]: grade } };
    }
  }
}

const KEY = "daily-practice:session";

/**
 * A stored session, or null for anything else. Sessions saved before
 * 11-26-2026 also carry the removed timer's `spent` and `running`, which are
 * dropped here so they are not saved again.
 */
export function toSession(x: unknown): Session | null {
  const s = x as Session;
  if (!s || typeof s.date !== "string" || ![s.grades, s.sent].every((r) => !!r && typeof r === "object")) return null;
  return { date: s.date, grades: s.grades, sent: s.sent };
}

export function loadSession(): Session | null {
  try {
    return toSession(JSON.parse(localStorage.getItem(KEY) ?? "null"));
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
