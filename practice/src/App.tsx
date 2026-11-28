import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
} from "react";
import { loadData, loadSource, type Loaded } from "./lib/data";
import {
  DIFFICULTY_NAME,
  GRADES,
  byCategory,
  daysBetween,
  formatDate,
  inkAlpha,
  logIssueError,
  logIssueRequest,
  logIssueUrl,
  loggedSince,
  pacificNow,
  pickView,
  retention,
  servedIds,
  slipLines,
  sourceUrl,
  type Card,
  type Grade,
  type LogEntry,
  type Problem,
  type State,
  type View,
} from "./lib/practice";
import {
  emptySession,
  loadSession,
  loadToken,
  reducer,
  saveSession,
  saveToken,
  type Action,
} from "./lib/session";
import {
  LANG_NAME,
  extractSnippet,
  maskSiteName,
  parseSourceRef,
  type SourceRef,
  type Snippet,
} from "./lib/snippet";

// Coming back to the tab after this long fetches the data again.
const STALE_MS = 2 * 60_000;

// The Design tab's code and the designs it shows load the first time it opens.
const DesignTab = lazy(() => import("./Design"));

// --- tabs ---

/** #coding (or no hash), #design for the list of designs, #design/<slug> for one. */
type Route = { tab: "coding" } | { tab: "design"; slug: string };

function readRoute(): Route {
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (h === "design") return { tab: "design", slug: "" };
  if (h.startsWith("design/")) return { tab: "design", slug: h.slice("design/".length) };
  return { tab: "coding" };
}

const routeKey = (r: Route) => (r.tab === "coding" ? "coding" : `design/${r.slug}`);
const routeHref = (r: Route) =>
  r.tab === "coding" ? "#coding" : r.slug ? `#design/${encodeURIComponent(r.slug)}` : "#design";

/**
 * The tab rail and the two views. Both views stay mounted once opened, so
 * switching keeps grades, open code panels and each view's scroll position;
 * the incoming view fades in and the rail's highlight slides to its tab.
 */
export default function App() {
  const [route, setRoute] = useState(readRoute);
  // The Design tab opens on the design you last had open there, or on the list.
  const [lastSlug, setLastSlug] = useState("");
  const [designSeen, setDesignSeen] = useState(false);
  const designSlug = route.tab === "design" ? route.slug : lastSlug;
  const designOpened = designSeen || route.tab === "design";
  const scrolls = useRef<Record<string, number>>({});
  const shown = useRef(routeKey(route));
  const views = useRef<Record<Route["tab"], HTMLDivElement | null>>({ coding: null, design: null });
  const tabs = useRef<Record<Route["tab"], HTMLAnchorElement | null>>({ coding: null, design: null });
  const highlight = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onHash = () => {
      scrolls.current[shown.current] = window.scrollY;
      setRoute(readRoute());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const placeHighlight = useCallback(() => {
    const tab = tabs.current[route.tab];
    const hl = highlight.current;
    if (!tab || !hl) return;
    hl.style.width = `${tab.offsetWidth}px`;
    hl.style.height = `${tab.offsetHeight}px`;
    hl.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
  }, [route.tab]);

  useLayoutEffect(() => {
    placeHighlight();
    const key = routeKey(route);
    if (key === shown.current) return;
    const tabChanged = shown.current.split("/")[0] !== route.tab;
    shown.current = key;
    if (route.tab === "design") {
      setLastSlug(route.slug);
      setDesignSeen(true);
    }
    if (tabChanged) {
      const view = views.current[route.tab];
      view?.classList.remove("enter");
      void view?.offsetWidth; // restart the fade
      view?.classList.add("enter");
    }
    window.scrollTo({ top: scrolls.current[key] ?? 0, behavior: "instant" });
  }, [route, placeHighlight]);

  useEffect(() => {
    // The highlight slides only after it has been placed once.
    const id = requestAnimationFrame(() => setReady(true));
    window.addEventListener("resize", placeHighlight);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", placeHighlight);
    };
  }, [placeHighlight]);

  const view = (tab: Route["tab"], body: ReactNode) => (
    <div
      className={route.tab === tab ? "view" : "view off"}
      aria-hidden={route.tab !== tab}
      ref={(el) => {
        views.current[tab] = el;
      }}
      onAnimationEnd={(e) => e.currentTarget.classList.remove("enter")}
    >
      {body}
    </div>
  );

  return (
    <div className="shell">
      <nav className="rail" aria-label="Practice">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="6" fill="var(--ink)" />
            <rect x="7" y="9" width="18" height="3" rx="1.5" fill="var(--mark)" />
            <rect x="7" y="15" width="13" height="3" rx="1.5" fill="var(--paper)" />
            <rect x="7" y="21" width="8" height="3" rx="1.5" fill="var(--paper)" opacity=".5" />
          </svg>
          Practice
        </div>
        <div className={ready ? "tabs ready" : "tabs"}>
          <span className="hl" ref={highlight} aria-hidden="true" />
          <a
            href="#coding"
            aria-current={route.tab === "coding" ? "page" : undefined}
            ref={(el) => {
              tabs.current.coding = el;
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 6 2 12l6 6M16 6l6 6-6 6" />
            </svg>
            Coding
          </a>
          <a
            href={routeHref({ tab: "design", slug: designSlug })}
            aria-current={route.tab === "design" ? "page" : undefined}
            ref={(el) => {
              tabs.current.design = el;
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="6" rx="1" />
              <rect x="14" y="15" width="7" height="6" rx="1" />
              <rect x="14" y="3" width="7" height="6" rx="1" />
              <path d="M10 6h4M17.5 9v6" />
            </svg>
            Design
          </a>
        </div>
      </nav>
      <main className="views">
        {view("coding", <Coding />)}
        {designOpened &&
          view(
            "design",
            <Suspense fallback={<p className="soft">Loading the designs…</p>}>
              <DesignTab slug={designSlug} active={route.tab === "design"} />
            </Suspense>,
          )}
      </main>
    </div>
  );
}

// --- the Coding tab: today's plan ---

function Coding() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadData());
      setLoadedAt(Date.now());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt > STALE_MS) void load();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load, loadedAt]);

  const refresh = (
    <p className="small soft footer">
      {loadedAt > 0 && <>Updated {new Date(loadedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. </>}
      <button onClick={() => void load()} disabled={loading}>
        {loading ? "Loading…" : "Refresh"}
      </button>
      {error && <span className="err"> Could not load the data: {error}</span>}
    </p>
  );

  if (!data) {
    return (
      <>
        <header>
          <p className="crumb">{formatDate(pacificNow(new Date()).date)}</p>
          <h1>Daily Practice</h1>
        </header>
        {error ? refresh : <p className="soft">Loading…</p>}
      </>
    );
  }
  return <Page data={data} footer={refresh} />;
}

function Page({ data, footer }: { data: Loaded; footer: ReactNode }) {
  const { problems, state, solutions } = data;
  const { date: today, hour } = pacificNow(new Date());
  const view = pickView(state, today);
  const byId = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems]);

  const planDate = view.kind === "plan" ? view.date : today;
  const reviewIds = view.kind === "plan" ? view.plan.review.filter((id) => byId.has(id)) : [];
  const newIds = view.kind === "plan" ? view.plan.new.filter((id) => byId.has(id)) : [];
  const ids = [...reviewIds, ...newIds];

  const [session, dispatch] = useReducer(reducer, planDate, (d) => loadSession() ?? emptySession(d));
  const idKey = ids.join(",");
  useEffect(() => {
    dispatch({ type: "open", date: planDate, ids: idKey ? idKey.split(",") : [] });
  }, [planDate, idKey]);
  useEffect(() => saveSession(session), [session]);

  const logged = (id: string) => loggedSince(state, id, planDate);
  const pending = slipLines(
    ids.filter((id) => !logged(id)),
    session.grades,
  );
  const done = ids.length > 0 && ids.every((id) => logged(id));

  return (
    <>
      <header>
        <p className="crumb">{formatDate(today)}</p>
        <h1>Daily Practice</h1>
        <p className="lead">{lead(view, today, hour, reviewIds.length, newIds.length, done)}</p>
        {view.kind === "paused" && (
          <div className="row">
            <a className="btn primary" href={logIssueUrl(today, "resume")} target="_blank" rel="noopener noreferrer">
              Resume
            </a>
            <span className="small soft">Opens a GitHub issue that says “resume”. Submit it, and a plan for today follows.</span>
          </div>
        )}
      </header>

      {view.kind === "plan" && (
        <section className="cols" aria-label="Plan">
          <div className="stack">
            <h2>{view.isToday ? count(ids.length, "problem") + " today" : `Plan from ${formatDate(view.date)}`}</h2>
            <ul className="list">
              {ids.map((id) => (
                <Item
                  key={id}
                  problem={byId.get(id)!}
                  card={state.cards[id]}
                  isNew={newIds.includes(id)}
                  logged={logged(id)}
                  sent={session.sent[id]}
                  grade={session.grades[id]}
                  solutions={solutions.get(byId.get(id)!.slug) ?? NONE}
                  today={today}
                  dispatch={dispatch}
                />
              ))}
            </ul>
          </div>
          <Slip date={today} lines={pending} onSend={() => dispatch({ type: "send" })} />
        </section>
      )}

      <Board problems={problems} state={state} today={today} planIds={ids} />
      {footer}
    </>
  );
}

const NONE: string[] = [];

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function lead(view: View, today: string, hour: number, reviews: number, fresh: number, done: boolean): string {
  switch (view.kind) {
    case "paused":
      return `Paused since ${formatDate(view.since)}: plans stop after a week without a log. Resume, or log any problem, to start again.`;
    case "empty":
      return "No plan has been recorded yet.";
    case "plan": {
      if (view.isToday) {
        const mix = `${count(reviews, "review")} and ${fresh} new.`;
        return done ? `${mix} All logged. The next plan comes early tomorrow, Pacific time.` : mix;
      }
      const from = `Until then, here is the plan from ${formatDate(view.date)}.`;
      if (daysBetween(view.date, today) > 1) return `No plan since ${formatDate(view.date)}. Today's usually comes by 4 AM Pacific, or else around 6 PM.`;
      return hour < 4
        ? `Today's plan usually comes by 4 AM Pacific. ${from}`
        : `Today's plan is late: GitHub skipped its overnight run, so it may not come until about 6 PM Pacific. ${from}`;
    }
  }
}

function ago(date: string, today: string): string {
  const n = daysBetween(date, today);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
}

interface ItemProps {
  problem: Problem;
  card?: Card;
  isNew: boolean;
  logged?: LogEntry;
  sent?: Grade;
  grade?: Grade;
  solutions: string[];
  today: string;
  dispatch: Dispatch<Action>;
}

function Item({ problem: p, card, isNew, logged, sent, grade, solutions, today, dispatch }: ItemProps) {
  const refs = useMemo(() => solutions.flatMap((link) => parseSourceRef(link) ?? []), [solutions]);
  const [showCode, setShowCode] = useState(false);
  const panel = useId();
  return (
    <li className="item">
      <div className="no">{p.id}</div>
      <div className="in">
        <div className="ttl">
          <a href={p.url} target="_blank" rel="noopener noreferrer">
            {p.title}
          </a>
        </div>
        <div className="row small soft">
          <span className={isNew ? "tag new" : "tag"}>{isNew ? "NEW" : "REVIEW"}</span>
          <span className="tag">{DIFFICULTY_NAME[p.difficulty]}</span>
          <span>{p.category}</span>
          {card && !logged && <span>last solved {ago(card.last, today)}</span>}
        </div>
        <div className="row">
          {refs.length > 0 && (
            <button aria-expanded={showCode} aria-controls={panel} onClick={() => setShowCode((v) => !v)}>
              {showCode ? "Hide code" : "Show code"}
            </button>
          )}
          {solutions[0] && (
            <a className="btn" href={sourceUrl(solutions[0])} target="_blank" rel="noopener noreferrer">
              My solution
            </a>
          )}
        </div>
        {showCode && <Code id={panel} refs={refs} />}
        {logged ? (
          <p className="status">
            Logged <b className={logged.grade}>{logged.grade}</b> {ago(logged.date, today)}.
          </p>
        ) : sent ? (
          <p className="status">
            Sent as <b className={sent}>{sent}</b>. It shows as logged a few minutes after the issue is submitted.
          </p>
        ) : (
          <div className="row" role="group" aria-label={`Grade ${p.title}`}>
            {GRADES.map((g) => (
              <button
                key={g}
                className={`g ${g}`}
                aria-pressed={grade === g}
                onClick={() => dispatch({ type: "grade", id: p.id, grade: g })}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

type CodeView = { html: string; snippet: Snippet } | { error: string };

/** Fetches the file, cuts this problem's solution out of it, and highlights it. */
async function renderSnippet(ref: SourceRef): Promise<CodeView> {
  try {
    // shiki loads while the file downloads.
    const [source, { highlight }] = await Promise.all([loadSource(ref.path), import("./lib/highlight")]);
    const snippet = extractSnippet(source, ref.line, ref.lang);
    return { snippet, html: await highlight(maskSiteName(snippet.code), ref.lang) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const refKey = (r: SourceRef) => `${r.path}#L${r.line}`;

/** The solution's code, one language at a time, as the README links it. */
function Code({ id, refs }: { id: string; refs: SourceRef[] }) {
  const [pick, setPick] = useState(0);
  const [views, setViews] = useState<Record<string, CodeView>>({});
  const ref = refs[Math.min(pick, refs.length - 1)];
  const key = refKey(ref);
  const view = views[key];

  useEffect(() => {
    if (views[key]) return;
    let live = true;
    void renderSnippet(ref).then((v) => {
      if (live) setViews((all) => ({ ...all, [key]: v }));
    });
    return () => {
      live = false;
    };
  }, [key, ref, views]);

  const range = view && "snippet" in view ? `#L${view.snippet.first}-L${view.snippet.last}` : "";
  return (
    <div className="code" id={id}>
      <div className="row small soft">
        {refs.length > 1 && (
          <span className="row" role="group" aria-label="Language">
            {refs.map((r, i) => (
              <button key={refKey(r)} className="lang" aria-pressed={r === ref} onClick={() => setPick(i)}>
                {LANG_NAME[r.lang]}
              </button>
            ))}
          </span>
        )}
        <a href={sourceUrl(ref.path + range)} target="_blank" rel="noopener noreferrer" className="path">
          {ref.path}
        </a>
      </div>
      {!view ? (
        <p className="small soft">Loading code…</p>
      ) : "error" in view ? (
        <p className="small err">Could not load the code: {view.error}</p>
      ) : (
        <div className="src" dangerouslySetInnerHTML={{ __html: view.html }} />
      )}
    </div>
  );
}

function Slip({ date, lines, onSend }: { date: string; lines: string[]; onSend: () => void }) {
  const [note, setNote] = useState("");
  const [token, setToken] = useState(loadToken);
  const [busy, setBusy] = useState(false);
  const text = lines.join("\n");
  // With a saved token: create the log issue directly, no GitHub form.
  const logNow = async () => {
    if (!text || busy) return;
    setBusy(true);
    const { url, init } = logIssueRequest(date, text, token);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        setNote(logIssueError(res.status));
        return;
      }
      const issue = (await res.json()) as { number?: number };
      onSend();
      setNote(`Sent as issue #${issue.number ?? "?"}. These show as logged here a few minutes after GitHub runs it.`);
    } catch {
      setNote("Couldn't reach GitHub. Use Log on GitHub instead.");
    } finally {
      setBusy(false);
    }
  };
  const keep = (t: string) => {
    saveToken(t);
    setToken(t);
    setNote(t ? "Token saved in this browser. Log now sends straight to GitHub." : "Token forgotten.");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied.");
    } catch {
      setNote("Could not copy. Select the lines above and copy them.");
    }
  };
  return (
    <aside className="slip" aria-label="Log">
      <h2>Log</h2>
      <pre>{text || "Grade a problem and it appears here."}</pre>
      {token && (
        <button className="send" onClick={() => void logNow()} disabled={!text || busy}>
          {busy ? "Sending…" : "Log now"}
        </button>
      )}
      {/* Always the same <a>, so the click that sends it is never on an element React just replaced. */}
      <a
        className={token ? "btn" : "btn send"}
        href={text ? logIssueUrl(date, text) : undefined}
        aria-disabled={!text}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!text) return e.preventDefault();
          // onSend clears the grades, and with them this link's href. React
          // re-renders before the click handler returns, and the browser
          // follows the link only after that, by which time there is no href
          // left to follow. Waiting one task lets the GitHub tab open first.
          setTimeout(onSend, 0);
          setNote("Opened on GitHub. Submit the issue there to log these.");
        }}
      >
        Log on GitHub
      </a>
      <button onClick={() => void copy()} disabled={!text}>
        Copy text
      </button>
      <p className="small soft">
        {note ||
          (token
            ? "Log now creates the issue for you. Log on GitHub opens it for you to check and submit."
            : "Opens a new GitHub issue with these lines filled in. Submit it, and they show as logged here a few minutes later.")}
      </p>
      <TokenSetup token={token} onSave={keep} />
    </aside>
  );
}

function TokenSetup({ token, onSave }: { token: string; onSave: (token: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  if (token) {
    return (
      <div className="row small soft">
        <span>One-tap logging is on in this browser.</span>
        <button onClick={() => onSave("")}>Forget token</button>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="row">
        <button onClick={() => setOpen(true)}>Set up one-tap logging</button>
      </div>
    );
  }
  return (
    <form
      className="token"
      onSubmit={(e) => {
        e.preventDefault();
        const t = draft.trim();
        if (!t) return;
        onSave(t);
        setDraft("");
        setOpen(false);
      }}
    >
      <label htmlFor="token" className="small">
        GitHub token
      </label>
      <input
        id="token"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <p className="small soft">
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
          Create a fine-grained token
        </a>{" "}
        for the GoCode repository only, with Issues: Read and write. It stays in this browser, and anyone using this
        browser can log with it.
      </p>
      <div className="row">
        <button type="submit" disabled={!draft.trim()}>
          Save token
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Board({ problems, state, today, planIds }: { problems: Problem[]; state: State; today: string; planIds: string[] }) {
  const [info, setInfo] = useState("Point at a number for details.");
  const served = useMemo(() => servedIds(state), [state]);
  const groups = useMemo(() => byCategory(problems), [problems]);
  const tally = { fresh: 0, fading: 0, faded: 0, shown: 0, unseen: 0 };

  const rows = groups.map(([category, ps]) => (
    <div className="cat" key={category}>
      <span>{category}</span>
      <div className="tiles">
        {ps.map((p) => {
          const card = state.cards[p.id];
          let cls = "t";
          let style: CSSProperties | undefined;
          let detail: string;
          if (card) {
            const r = retention(card, today);
            const a = inkAlpha(r);
            cls += a > 0.55 ? " ink dark" : " ink";
            style = { "--a": a.toFixed(2) } as CSSProperties;
            tally[r >= 0.9 ? "fresh" : r >= 0.3 ? "fading" : "faded"]++;
            const due = card.due <= today ? "due now" : `next review ${formatDate(card.due)}`;
            detail = `last solved ${formatDate(card.last)}, ${due}, about ${Math.round(r * 100)}% remembered`;
          } else if (served.has(p.id)) {
            cls += " seen";
            tally.shown++;
            detail = "shown before, never logged";
          } else {
            tally.unseen++;
            detail = "not seen yet";
          }
          if (planIds.includes(p.id)) cls += " today";
          const label = `#${p.id} ${p.title} (${DIFFICULTY_NAME[p.difficulty]}): ${detail}`;
          const show = () => setInfo(label);
          return (
            <button key={p.id} className={cls} style={style} aria-label={label} onMouseEnter={show} onFocus={show} onClick={show}>
              {p.id}
            </button>
          );
        })}
      </div>
    </div>
  ));

  const key: [string, CSSProperties][] = [
    [`Fresh: ${tally.fresh}`, { background: "rgb(var(--ink-rgb))" }],
    [`Fading: ${tally.fading}`, { background: "rgb(var(--ink-rgb) / .45)" }],
    [`Faded: ${tally.faded}`, { background: "rgb(var(--ink-rgb) / .06)" }],
    [`Shown, not logged: ${tally.shown}`, {}],
    [`Not seen: ${tally.unseen}`, { borderColor: "transparent" }],
  ];
  if (planIds.length) key.push(["In the plan", { boxShadow: "0 0 0 2px var(--mark)", borderColor: "transparent" }]);

  return (
    <section className="stack" aria-label="Memory board">
      <h2>Ink board</h2>
      <p className="soft small measure">
        Every problem in the set. A number prints darker the better you should remember it, and fades as its review
        date passes. The fade is an estimate: 90% on the day a review is due.
      </p>
      <div className="key">
        {key.map(([text, style]) => (
          <span key={text}>
            <i style={style} />
            {text}
          </span>
        ))}
      </div>
      <p className="info" aria-live="polite">
        {info}
      </p>
      <div className="board">{rows}</div>
    </section>
  );
}
