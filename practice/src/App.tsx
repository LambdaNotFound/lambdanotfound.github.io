import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
} from "react";
import { loadData, type Loaded } from "./lib/data";
import {
  DIFFICULTY_NAME,
  GRADES,
  addDays,
  byCategory,
  daysBetween,
  formatDate,
  inkAlpha,
  logIssueUrl,
  loggedSince,
  pacificNow,
  pickView,
  retention,
  servedIds,
  slipLines,
  sourceUrl,
  suggestGrade,
  type Card,
  type Grade,
  type LogEntry,
  type Problem,
  type State,
  type View,
} from "./lib/practice";
import { elapsed, emptySession, loadSession, reducer, saveSession, type Action } from "./lib/session";

// Coming back to the tab after this long fetches the data again.
const STALE_MS = 2 * 60_000;

export default function App() {
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
      <main>
        <header>
          <h1>Daily Practice</h1>
        </header>
        {error ? refresh : <p className="soft">Loading…</p>}
      </main>
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

  // Repaint the running clock; nothing else on the page changes by itself.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!session.running) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [session.running]);

  const now = Date.now();
  const logged = (id: string) => loggedSince(state, id, planDate);
  const pending = slipLines(
    ids.filter((id) => !logged(id)),
    session.grades,
  );
  const done = ids.length > 0 && ids.every((id) => logged(id));

  return (
    <main>
      <header>
        <div className="top">
          <h1>Daily Practice</h1>
          <span className="soft">{formatDate(today)}</span>
        </div>
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
                  seconds={elapsed(session, id, now)}
                  running={session.running?.id === id}
                  solution={solutions.get(byId.get(id)!.slug)?.[0]}
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
    </main>
  );
}

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
        return done ? `${mix} All logged. The next plan comes tomorrow after 3 PM Pacific.` : mix;
      }
      const from = `Until then, here is the plan from ${formatDate(view.date)}.`;
      if (daysBetween(view.date, today) > 1) return `No plan since ${formatDate(view.date)}. Today's comes after 3 PM Pacific.`;
      return hour < 15
        ? `Today's plan comes after 3 PM Pacific. ${from}`
        : `Today's plan is on its way: GitHub often starts it a few hours after 3 PM Pacific. ${from}`;
    }
  }
}

function ago(date: string, today: string): string {
  const n = daysBetween(date, today);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
}

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface ItemProps {
  problem: Problem;
  card?: Card;
  isNew: boolean;
  logged?: LogEntry;
  sent?: Grade;
  grade?: Grade;
  seconds: number;
  running: boolean;
  solution?: string;
  today: string;
  dispatch: Dispatch<Action>;
}

function Item({ problem: p, card, isNew, logged, sent, grade, seconds, running, solution, today, dispatch }: ItemProps) {
  const open = !logged && !sent;
  const suggestion = open && !grade && !running && seconds >= 60 ? suggestGrade(p.difficulty, seconds / 60) : undefined;
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
          {open && (
            <>
              <span className="clock" aria-label="Time spent">{mmss(seconds)}</span>
              <button onClick={() => dispatch({ type: "timer", id: p.id, now: Date.now() })}>
                {running ? "Stop" : seconds > 0 ? "Continue timer" : "Start timer"}
              </button>
            </>
          )}
          {solution && (
            <a className="btn" href={sourceUrl(solution)} target="_blank" rel="noopener noreferrer">
              My solution
            </a>
          )}
        </div>
        {logged ? (
          <p className="status">
            Logged <b className={logged.grade}>{logged.grade}</b> {ago(logged.date, today)}.
          </p>
        ) : sent ? (
          <p className="status">
            Sent as <b className={sent}>{sent}</b>. It shows as logged a few minutes after you submit the issue.
          </p>
        ) : (
          <div className="row" role="group" aria-label={`Grade ${p.title}`}>
            {GRADES.map((g) => (
              <button
                key={g}
                className={`g ${g}${g === suggestion ? " sug" : ""}`}
                aria-pressed={grade === g}
                onClick={() => dispatch({ type: "grade", id: p.id, grade: g, now: Date.now() })}
              >
                {g}
              </button>
            ))}
            {suggestion && (
              <span className="small soft">
                {mmss(seconds)} suggests {suggestion}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Slip({ date, lines, onSend }: { date: string; lines: string[]; onSend: () => void }) {
  const [note, setNote] = useState("");
  const text = lines.join("\n");
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
      {/* Always the same <a>, so the click that sends it is never on an element React just replaced. */}
      <a
        className="btn send"
        href={text ? logIssueUrl(date, text) : undefined}
        aria-disabled={!text}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!text) return e.preventDefault();
          onSend();
          setNote("Opened on GitHub. Submit the issue there to log these.");
        }}
      >
        Log on GitHub
      </a>
      <button onClick={() => void copy()} disabled={!text}>
        Copy text
      </button>
      <p className="small soft">
        {note || "Opens a new GitHub issue with these lines filled in. Submit it, and they show as logged here a few minutes later."}
      </p>
    </aside>
  );
}

function Board({ problems, state, today, planIds }: { problems: Problem[]; state: State; today: string; planIds: string[] }) {
  const [offset, setOffset] = useState(0);
  const [info, setInfo] = useState("Point at a number for details.");
  const date = addDays(today, offset);
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
            const r = retention(card, date);
            const a = inkAlpha(r);
            cls += a > 0.55 ? " ink dark" : " ink";
            style = { "--a": a.toFixed(2) } as CSSProperties;
            tally[r >= 0.9 ? "fresh" : r >= 0.3 ? "fading" : "faded"]++;
            const due = card.due <= date ? "due now" : `next review ${formatDate(card.due)}`;
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
      <div className="slide">
        <label htmlFor="ahead">{offset === 0 ? "Today" : `In ${count(offset, "day")}, ${formatDate(date)}, with no reviews`}</label>
        <input id="ahead" type="range" min={0} max={60} value={offset} onChange={(e) => setOffset(Number(e.target.value))} />
      </div>
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
