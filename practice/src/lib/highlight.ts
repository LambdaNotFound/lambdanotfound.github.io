// Syntax highlighting for the "Show code" panel, with shiki. App imports
// this module only when a panel first opens, so shiki stays out of the
// page's first load, and each grammar loads the first time its language is
// shown. The JavaScript regex engine avoids shipping Oniguruma's WebAssembly.
//
// Both themes go into the HTML as CSS variables (--shiki-light,
// --shiki-dark) and styles.css picks one with the page's own light or dark
// scheme. They were picked for contrast against the page's own --sheet
// colors: every token color is at least 4.9:1 in light and 5.4:1 in dark.

import { createHighlighterCore, type HighlighterCore, type LanguageInput } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { Lang } from "./snippet";

const THEMES = { light: "github-light-high-contrast", dark: "github-dark-default" } as const;

const GRAMMARS: Record<Lang, () => LanguageInput> = {
  go: () => import("shiki/langs/go.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
};

let core: Promise<HighlighterCore> | undefined;

function highlighter(): Promise<HighlighterCore> {
  core ??= createHighlighterCore({
    themes: [import("shiki/themes/github-light-high-contrast.mjs"), import("shiki/themes/github-dark-default.mjs")],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  }).catch((e: unknown) => {
    core = undefined; // let the next panel try again
    throw e;
  });
  return core;
}

/** Highlighted HTML for one snippet: a <pre class="shiki"> with escaped code. */
export async function highlight(code: string, lang: Lang): Promise<string> {
  const h = await highlighter();
  if (!h.getLoadedLanguages().includes(lang)) await h.loadLanguage(GRAMMARS[lang]());
  return h.codeToHtml(code, { lang, themes: THEMES, defaultColor: false });
}
