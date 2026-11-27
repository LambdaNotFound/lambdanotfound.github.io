// Draws the RFCs' Mermaid diagrams in the browser. Mermaid is large, so it is
// not bundled: it loads from jsDelivr, pinned to one version, the first time a
// design with a diagram opens. Diagrams draw one at a time, since Mermaid's
// renderer keeps shared state while it works.

const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}

let api: Promise<MermaidApi> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let count = 0;

function load(): Promise<MermaidApi> {
  if (!api) {
    api = import(/* @vite-ignore */ MERMAID_URL).then((m: { default: MermaidApi }) => {
      // The RFCs set their own light colors, so diagrams stay on a light plate in both themes.
      m.default.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });
      return m.default;
    });
    // A failed load is forgotten, so the next diagram tries again.
    api.catch(() => {
      api = null;
    });
  }
  return api;
}

/** The diagram as SVG markup, sanitized by Mermaid's strict mode. */
export function renderMermaid(text: string): Promise<string> {
  const job = queue.then(async () => {
    const mermaid = await load();
    const { svg } = await mermaid.render(`mermaid-${++count}`, text);
    return svg;
  });
  queue = job.catch(() => undefined);
  return job;
}
