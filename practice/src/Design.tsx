// The Design tab: the system designs from the system-design repository, each
// laid out in the order of a system design interview. Loaded the first time
// the tab opens, with the designs copied in at build time (src/lib/designs.ts).

import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { DESIGNS_COMMIT, designs } from "./lib/designs";
import { renderMermaid } from "./lib/mermaid";
import {
  firstSentence,
  inline,
  type Block,
  type Decision,
  type Design,
  type Entity,
  type Inline,
  type Requirement,
  type Section,
} from "./lib/rfc";

export default function DesignTab({ slug, active }: { slug: string; active: boolean }) {
  if (!slug) return <DesignIndex />;
  const design = designs.find((d) => d.slug === slug);
  if (!design) {
    return (
      <>
        <header className="dhead">
          <p className="crumb">
            <a href="#design">Designs</a>
          </p>
          <h1>Not found</h1>
        </header>
        <p className="soft">
          No design named “{slug}” in this build. <a href="#design">See the designs that are here.</a>
        </p>
      </>
    );
  }
  return <DesignPage key={design.slug} d={design} active={active} />;
}

function DesignIndex() {
  return (
    <>
      <header className="dhead">
        <p className="crumb">System design</p>
        <h1>Designs</h1>
        <p className="soft measure">
          Each design is laid out in the order you’d present it in an interview: requirements, entities, API, data flow,
          high-level design, deep dives.
        </p>
      </header>
      {designs.length ? (
        <ul className="dlist">
          {designs.map((d) => (
            <li key={d.slug}>
              <a className="dcard" href={`#design/${encodeURIComponent(d.slug)}`}>
                <div className="row spread">
                  <h2>{d.title}</h2>
                  {d.status && <span className="tag">{d.status}</span>}
                </div>
                {d.summary && (
                  <p className="measure">
                    <Text text={d.summary} />
                  </p>
                )}
                <Facts d={d} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="soft">No designs in this build. The deploy copies them in from the system-design repository.</p>
      )}
      <BuiltFrom />
    </>
  );
}

function Facts({ d }: { d: Design }) {
  const facts = [
    d.functional.length && `${d.functional.length} FR`,
    d.nonFunctional.length && `${d.nonFunctional.length} NFR`,
    d.decisions.length && `${d.decisions.length} deep dive${d.decisions.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return facts.length ? (
    <div className="facts">
      {facts.map((f) => (
        <span className="fact" key={String(f)}>
          {f}
        </span>
      ))}
    </div>
  ) : null;
}

function BuiltFrom() {
  return DESIGNS_COMMIT ? (
    <p className="small soft">
      Built from system-design at{" "}
      <a
        href={`https://github.com/LambdaNotFound/system-design/tree/${DESIGNS_COMMIT}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <code>{DESIGNS_COMMIT.slice(0, 7)}</code>
      </a>
      .
    </p>
  ) : null;
}

// --- requirement chips ---

interface Chips {
  reqs: Map<string, Requirement>;
  open: (id: string, el: HTMLElement) => void;
  openId: string;
}

const ChipContext = createContext<Chips>({ reqs: new Map(), open: () => {}, openId: "" });

/** Inline Markdown, with FR and NFR ids as chips that show the requirement. */
function Text({ text }: { text: string }) {
  const { reqs } = useContext(ChipContext);
  const tokens = useMemo(() => inline(text, (id) => reqs.has(id)), [text, reqs]);
  return <Tokens tokens={tokens} />;
}

function Tokens({ tokens }: { tokens: Inline[] }) {
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.t) {
          case "text":
            return <Fragment key={i}>{t.v}</Fragment>;
          case "b":
            return (
              <b key={i}>
                <Tokens tokens={t.v} />
              </b>
            );
          case "i":
            return (
              <i key={i}>
                <Tokens tokens={t.v} />
              </i>
            );
          case "code":
            return <code key={i}>{t.v}</code>;
          case "link":
            return (
              <a key={i} href={t.href} target="_blank" rel="noopener noreferrer">
                {t.v}
              </a>
            );
          case "req":
            return <Chip key={i} id={t.v} />;
        }
      })}
    </>
  );
}

function Chip({ id }: { id: string }) {
  const { open, openId } = useContext(ChipContext);
  return (
    <button
      type="button"
      className="chip"
      aria-expanded={openId === id}
      onClick={(e: MouseEvent<HTMLButtonElement>) => open(id, e.currentTarget)}
    >
      {id}
    </button>
  );
}

// --- blocks ---

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case "p":
      return (
        <p className="measure">
          <Text text={b.text} />
        </p>
      );
    case "list": {
      const items = b.items.map((t, i) => (
        <li key={i}>
          <Text text={t} />
        </li>
      ));
      return b.ordered ? <ol className="plain">{items}</ol> : <ul className="plain">{items}</ul>;
    }
    case "table":
      return (
        <div className="tablewrap">
          <table>
            {b.head.length > 0 && (
              <thead>
                <tr>
                  {b.head.map((h, i) => (
                    <th key={i}>
                      <Text text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      <Text text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return <pre className="codeblock">{b.text}</pre>;
    case "mermaid":
      return <Diagram text={b.text} />;
    case "pc":
      return (
        <div className="pc">
          <div className="pro">
            <b>Pros</b>
            <span>
              <Text text={b.pro} />
            </span>
          </div>
          <div className="con">
            <b>Cons</b>
            <span>
              <Text text={b.con} />
            </span>
          </div>
        </div>
      );
  }
}

function Diagram({ text }: { text: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    renderMermaid(text).then(
      (s) => live && setSvg(s),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [text]);
  if (error) {
    return (
      <figure className="diagram">
        <p className="small err">Could not draw this diagram ({error}). Its source:</p>
        <pre className="codeblock">{text}</pre>
      </figure>
    );
  }
  return (
    <figure className="diagram">
      {svg ? (
        <div className="plate" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="plate loading small">Drawing the diagram…</div>
      )}
    </figure>
  );
}

function More({ label, meta, blocks, children }: { label: string; meta?: string; blocks?: Block[]; children?: ReactNode }) {
  if (!children && !blocks?.length) return null;
  return (
    <details>
      <summary>
        {label}
        {meta && <span className="meta">{meta}</span>}
      </summary>
      <div className="inner">
        {blocks && <Blocks blocks={blocks} />}
        {children}
      </div>
    </details>
  );
}

/** A section's first paragraph and its diagrams up front; the rest behind "More". */
function Outline({ s, keep = () => false, more = "More" }: { s: Section; keep?: (b: Block) => boolean; more?: string }) {
  const lead = s.blocks.find((b) => b.kind === "p");
  const shown = s.blocks.filter((b) => b === lead || b.kind === "mermaid" || keep(b));
  const rest = s.blocks.filter((b) => !shown.includes(b));
  return (
    <>
      <Blocks blocks={shown} />
      <More label={more} blocks={rest} />
    </>
  );
}

// --- the design page ---

const STEPS = [
  { id: "functional", title: "Functional requirements", time: "~3 min" },
  { id: "nonfunctional", title: "Non-functional requirements", time: "~3 min" },
  { id: "entities", title: "Core entities", time: "~2 min" },
  { id: "api", title: "API", time: "~5 min" },
  { id: "flow", title: "Data flow", time: "~5 min" },
  { id: "architecture", title: "Architecture diagram", time: "~5 min" },
  { id: "hld", title: "High-level design", time: "~10 min" },
  { id: "lld", title: "Low-level design & deep dives", time: "~10 min" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function DesignPage({ d, active }: { d: Design; active: boolean }) {
  const reqs = useMemo(() => new Map([...d.functional, ...d.nonFunctional].map((r) => [r.id, r])), [d]);
  const [pop, setPop] = useState<{ id: string; left: number; top: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<StepId>("functional");
  const sections = useRef<Partial<Record<StepId, HTMLElement | null>>>({});
  const stepList = useRef<HTMLOListElement>(null);

  const chips = useMemo<Chips>(
    () => ({
      reqs,
      openId: pop?.id ?? "",
      open: (id, el) => {
        if (pop?.id === id) return setPop(null);
        const r = el.getBoundingClientRect();
        const width = Math.min(384, window.innerWidth - 32);
        const left = Math.max(16, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - width - 16));
        setPop({ id, left, top: r.bottom + window.scrollY + 6 });
      },
    }),
    [reqs, pop],
  );

  // One requirement card at a time; a click elsewhere, Escape or leaving the tab closes it.
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: Event) => {
      const t = e.target as Element | null;
      if (!t?.closest(".chip") && !popRef.current?.contains(t)) setPop(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    const close = () => setPop(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [pop]);
  useEffect(() => {
    if (!active) setPop(null);
  }, [active]);

  // The step list follows the scroll.
  useEffect(() => {
    if (!active || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id.replace(/^step-/, "") as StepId);
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    for (const el of Object.values(sections.current)) if (el) io.observe(el);
    return () => io.disconnect();
  }, [active]);

  // On a narrow screen the step list is a strip: keep the current step in view.
  useEffect(() => {
    const strip = stepList.current;
    const cur = strip?.querySelector<HTMLElement>('[aria-current="step"]');
    if (strip && cur && strip.scrollWidth > strip.clientWidth) {
      strip.scrollTo({ left: (cur.parentElement?.offsetLeft ?? 0) - 16, behavior: "smooth" });
    }
  }, [current]);

  const step = (id: StepId, body: ReactNode) => {
    const i = STEPS.findIndex((s) => s.id === id);
    const s = STEPS[i];
    return (
      <section
        className="step"
        id={`step-${id}`}
        aria-labelledby={`step-${id}-h`}
        ref={(el) => {
          sections.current[id] = el;
        }}
      >
        <header>
          <span className="kicker">
            <b>Step {i + 1}</b> · {s.time}
          </span>
          <h2 id={`step-${id}-h`}>{s.title}</h2>
        </header>
        {body}
      </section>
    );
  };

  return (
    <ChipContext.Provider value={chips}>
      <div className="design">
        <header className="dhead">
          <p className="crumb">
            <a href="#design">Designs</a> / {d.title}
          </p>
          <h1>{d.title}</h1>
          <div className="facts">
            {d.status && <span className="fact">{d.status}</span>}
            <Facts d={d} />
            <a className="fact" href={d.url} target="_blank" rel="noopener noreferrer">
              Full RFC ↗
            </a>
          </div>
          {d.forcing && (
            <blockquote className="forcing">
              <small>The forcing question</small>
              <Text text={d.forcing} />
            </blockquote>
          )}
          <More label="Why it’s hard" blocks={d.problem} />
        </header>

        <div className="dbody">
          <ol className="steps" aria-label="Steps" ref={stepList}>
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={current === s.id ? "step" : undefined}
                  onClick={() => {
                    setCurrent(s.id);
                    sections.current[s.id]?.scrollIntoView({ block: "start" });
                  }}
                >
                  <span className="n">{i + 1}</span>
                  {s.title}
                  <span className="t">{s.time}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="content">
            {step("functional", <FunctionalStep d={d} />)}
            {step("nonfunctional", <NonFunctionalStep d={d} />)}
            {step("entities", <EntitiesStep d={d} />)}
            {step(
              "api",
              d.api ? <Blocks blocks={d.api.blocks} /> : <p className="soft">The RFC has no API section.</p>,
            )}
            {step("flow", <FlowStep d={d} />)}
            {step(
              "architecture",
              d.architecture.length ? (
                <Blocks blocks={d.architecture} />
              ) : (
                <p className="soft">The RFC has no architecture diagram yet.</p>
              ),
            )}
            {step("hld", <HighLevelStep d={d} />)}
            {step("lld", <LowLevelStep d={d} />)}
            <footer className="dfoot">
              <p>
                Taken from <code>design-doc/{d.slug}/rfc.md</code> in the system-design repository. Not shown here:
                Background, Work Breakdown, Appendix and References, which are in the{" "}
                <a href={d.url} target="_blank" rel="noopener noreferrer">
                  full RFC
                </a>
                .
              </p>
              <BuiltFrom />
            </footer>
          </div>
        </div>

        {pop &&
          reqs.has(pop.id) &&
          // In <body>, so the card is placed against the page whatever the views do.
          createPortal(
            <div className="pop" role="dialog" aria-label={pop.id} ref={popRef} style={{ left: pop.left, top: pop.top }}>
              <p className="ph">
                {pop.id}
                {reqs.get(pop.id)!.label && <span> · {reqs.get(pop.id)!.label}</span>}
              </p>
              <p>
                <Text text={reqs.get(pop.id)!.text} />
              </p>
            </div>,
            document.body,
          )}
      </div>
    </ChipContext.Provider>
  );
}

function FunctionalStep({ d }: { d: Design }) {
  if (!d.functional.length) return <p className="soft">The RFC lists no functional requirements.</p>;
  return (
    <>
      <div className="sub">
        <div className="tablewrap">
          <table>
            <tbody>
              {d.functional.map((r) => (
                <tr key={r.id}>
                  <td className="id">{r.id}</td>
                  <td>
                    <Text text={r.text} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <More label="Out of scope" meta={count(d.outOfScope)} blocks={d.outOfScope} />
    </>
  );
}

function NonFunctionalStep({ d }: { d: Design }) {
  return (
    <>
      {d.nonFunctional.length > 0 ? (
        <div className="sub">
          <div className="nfrs">
            {d.nonFunctional.map((r) => (
              <details key={r.id}>
                <summary>
                  <span className="id">{r.id}</span> {r.label || firstSentence(r.text).head}
                </summary>
                <div className="inner">
                  <p>
                    <Text text={r.text} />
                  </p>
                </div>
              </details>
            ))}
          </div>
        </div>
      ) : (
        <p className="soft">The RFC lists no non-functional requirements.</p>
      )}
      <More label="Capacity estimates" meta={count(d.estimates)} blocks={d.estimates} />
    </>
  );
}

/** "7 items", counting list items, for a summary line. */
function count(blocks: Block[]): string {
  const n = blocks.reduce((sum, b) => sum + (b.kind === "list" ? b.items.length : 0), 0);
  return n ? `${n} item${n === 1 ? "" : "s"}` : "";
}

function EntitiesStep({ d }: { d: Design }) {
  if (!d.entities) return <p className="soft">The RFC has no data model section.</p>;
  const lead = d.entities.blocks.find((b) => b.kind === "p");
  const pcs = d.entities.blocks.filter((b) => b.kind === "pc");
  // With the tables drawn, the SQL that made them moves behind "More".
  const rest = d.entities.blocks.filter((b) => b !== lead && b.kind !== "pc" && (d.tables.length > 0 || b.kind !== "code"));
  const code = d.tables.length ? [] : d.entities.blocks.filter((b) => b.kind === "code");
  return (
    <>
      {lead && <BlockView b={lead} />}
      {d.tables.map((t) => (
        <EntityCard key={t.name} t={t} />
      ))}
      <Blocks blocks={code} />
      <Blocks blocks={pcs} />
      <More label="More on the data model" blocks={rest} />
      <More label="Terms" blocks={d.terms} />
    </>
  );
}

function EntityCard({ t }: { t: Entity }) {
  return (
    <div className="entity" role="table" aria-label={`${t.name} table`}>
      <div className="eh" role="row">
        <span role="columnheader">{t.name}</span>
      </div>
      {t.columns.map((c) => (
        <div className="f" role="row" key={c.name}>
          <span role="cell">
            <code>{c.name}</code>
            {c.key && <span className="colkey">{c.key}</span>}
          </span>
          <span role="cell" className="ty">
            {c.type}
          </span>
          <span role="cell" className="why">
            <Text text={c.note} />
          </span>
        </div>
      ))}
    </div>
  );
}

function FlowStep({ d }: { d: Design }) {
  return (
    <>
      {d.example && (
        <div className="callout trace">
          <b className="k">Trace</b>
          <Blocks blocks={d.example.blocks} />
        </div>
      )}
      {d.flows.length ? (
        d.flows.map((s) => (
          <div className="sub" key={s.title}>
            <h3>{s.title}</h3>
            <Outline s={s} keep={(b) => b.kind === "list" && b.ordered} more="Steps, concurrency and errors" />
          </div>
        ))
      ) : (
        <p className="soft">The RFC draws no request as a sequence.</p>
      )}
    </>
  );
}

/** The overview's prose, and each component in one sentence; step 8 has the rest. */
function HighLevelStep({ d }: { d: Design }) {
  return (
    <>
      {d.overview?.blocks.length ? <Blocks blocks={d.overview.blocks} /> : <p className="soft">The RFC has no overview.</p>}
      {d.components.length > 0 && (
        <div className="cards">
          {d.components.map((s) => (
            <Component key={s.title} s={s} />
          ))}
        </div>
      )}
    </>
  );
}

function Component({ s }: { s: Section }) {
  const lead = s.blocks.find((b) => b.kind === "p");
  const head = lead && lead.kind === "p" ? firstSentence(lead.text).head : "";
  return (
    <div className="comp">
      <h3>{s.title}</h3>
      {head && (
        <p>
          <Text text={head} />
        </p>
      )}
    </div>
  );
}

/** Each component in full, with its type sketches up front, then the decisions and failure modes. */
function LowLevelStep({ d }: { d: Design }) {
  return (
    <>
      {d.components.map((s) => (
        <div className="sub" key={s.title}>
          <h3>{s.title}</h3>
          <Outline s={s} keep={(b) => b.kind === "code" || b.kind === "pc"} more="Details" />
        </div>
      ))}
      {(d.decisions.length > 0 || d.failureModes.length > 0) && (
        <div className="sub">
          <h3>Deep dives</h3>
          <DivesStep d={d} />
        </div>
      )}
    </>
  );
}

function DivesStep({ d }: { d: Design }) {
  return (
    <>
      {d.decisions.length > 0 && (
        <p className="small soft measure">
          Each decision shows what the RFC chose and what it rejected, with the reason. The RFC doesn’t grade options good
          or bad, so neither does this page.
        </p>
      )}
      {d.decisions.map((x) => (
        <DecisionCard key={x.title} x={x} />
      ))}
      {d.failureModes.length > 0 && (
        <More label="Failure modes" meta={String(d.failureModes.length)}>
          <ul className="plain">
            {d.failureModes.map((f) => (
              <li key={f.name}>
                <b>
                  <Text text={f.name} />.
                </b>{" "}
                <Text text={f.text} />
              </li>
            ))}
          </ul>
          <Blocks blocks={d.failureNotes} />
        </More>
      )}
    </>
  );
}

function DecisionCard({ x }: { x: Decision }) {
  const rejected = x.alternatives.length;
  return (
    <details className="dive">
      <summary>
        {x.title}
        <span className="chosen-line">
          {x.chosen && (
            <>
              Chosen: <Text text={x.chosen.replace(/\.$/, "")} />
              {rejected > 0 && " · "}
            </>
          )}
          {rejected > 0 && `${rejected} rejected`}
        </span>
      </summary>
      <div className="inner">
        {x.chosen && (
          <div className="opt win">
            <div className="oh">
              <span className="badge win">Chosen</span>
              <h4>
                <Text text={x.chosen} />
              </h4>
            </div>
          </div>
        )}
        {x.alternatives.map((a) => (
          <div className="opt" key={a.name}>
            <div className="oh">
              <span className="badge lose">Rejected</span>
              <h4>
                <Text text={a.name} />
              </h4>
              {a.flip && <span className="badge flip">Could flip</span>}
            </div>
            <p>
              <b>Pro:</b> <Text text={a.pro} /> <b>Con:</b> <Text text={a.con} />
            </p>
            {a.flip && (
              <p className="flipnote">
                <Text text={a.flip} />
              </p>
            )}
          </div>
        ))}
        <Blocks blocks={x.notes} />
      </div>
    </details>
  );
}
