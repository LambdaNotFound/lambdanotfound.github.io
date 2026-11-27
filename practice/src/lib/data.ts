// Reads the practice data straight from the public GoCode repository on each
// visit, so the page needs no rebuild when the bot records a plan. GitHub
// caches raw files for about five minutes.

import { REPO, parseSolutions, type Problem, type State } from "./practice";

// VITE_DATA_BASE points a local test build at fixture files instead.
const RAW: string = import.meta.env.VITE_DATA_BASE || `https://raw.githubusercontent.com/${REPO}/main/`;

export interface Loaded {
  problems: Problem[];
  state: State;
  solutions: Map<string, string[]>;
}

async function get(path: string): Promise<Response> {
  const res = await fetch(RAW + path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
  return res;
}

// Solution files for the "Show code" panel, fetched on first use and kept
// for as long as the page is open. A failed fetch is forgotten, so opening
// the panel again retries.
const sources = new Map<string, Promise<string>>();

export function loadSource(path: string): Promise<string> {
  let text = sources.get(path);
  if (!text) {
    text = get(path).then((r) => r.text());
    text.catch(() => sources.delete(path));
    sources.set(path, text);
  }
  return text;
}

export async function loadData(): Promise<Loaded> {
  const [problems, state, readme] = await Promise.all([
    get("spaced_repetition/problems.json").then((r) => r.json() as Promise<Problem[]>),
    get("spaced_repetition/state.json").then((r) => r.json() as Promise<State>),
    // Only for the "my solution" links; the page works without it.
    get("README.md").then((r) => r.text()).catch(() => ""),
  ]);
  return { problems, state, solutions: parseSolutions(readme) };
}
