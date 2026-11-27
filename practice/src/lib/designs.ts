// The designs, copied in when the page is built. The deploy workflow checks
// out the system-design repository into practice/designs-src/, and Vite
// bundles every design-doc/<slug>/rfc.md it finds there into this module's
// chunk, which loads the first time the Design tab opens. A build with no
// checkout has no designs, and the tab says so.

import { parseRfc, slugOf, type Design } from "./rfc";

const files = import.meta.glob<string>("../../designs-src/design-doc/*/rfc.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The system-design commit this build read, or "" when the build had none. */
export const DESIGNS_COMMIT: string = import.meta.env.VITE_DESIGNS_COMMIT ?? "";

export const designs: Design[] = Object.entries(files)
  .map(([path, text]) => parseRfc(text, slugOf(path), DESIGNS_COMMIT || "main"))
  .sort((a, b) => a.title.localeCompare(b.title));
