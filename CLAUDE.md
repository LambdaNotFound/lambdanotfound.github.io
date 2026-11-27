# CLAUDE.md

Personal GitHub Pages site. The root `index.html` is a placeholder. The real content is the Daily Practice page in `practice/` (Vite, React 19, TypeScript, plain CSS, Vitest), served at https://lambdanotfound.github.io/practice/. See [README.md](README.md) for the data flow and the dev commands.

## Rules for the page

- **No "leetcode" in anything a viewer sees.** That covers the page text, `<title>`, button labels, and the title and body of the log issue the page opens. Links may point at leetcode.com, but the word must not appear as visible text. The browser check below tests `document.title` plus `document.body.innerText` against `/leetcode/i`. Some solution comments in GoCode name the site, so code snippets go through `maskSiteName` before they are shown.
- **The look is settled.** Build on the tokens, light and dark themes and layout in `practice/src/styles.css`, and don't restyle the page.
- **No backend.** The page reads `spaced_repetition/state.json`, `problems.json` and `README.md` from GoCode's `main` at runtime, plus, when "Show code" is pressed, the solution file the README links for that problem, and logs by opening a prefilled "Practice log YYYY-MM-DD" issue in GoCode, which GoCode's `log-solve.yml` accepts. With a token the viewer saved (localStorage, never sent anywhere but api.github.com), "Log now" creates the same issue through the API instead; the issue is opened as the token's owner, which is what `log-solve.yml` checks. The types in `practice/src/lib/practice.ts` mirror GoCode's files: when either side changes shape, change the other in the same piece of work.
- **Code snippets.** `src/lib/snippet.ts` starts at the comment holding the README link's `#L` line and runs to the next block comment or docstring at that comment's indentation, a `// N. Title` line comment, or less-indented code; a link to line 1 shows the whole file. So it depends on GoCode's header comments, and GoCode's `CLAUDE.md` says so. `src/lib/highlight.ts` is shiki's fine-grained core with the JavaScript regex engine (no WebAssembly), imported only when a panel first opens, and each grammar loads on first use. Its two themes put every token color at 4.9:1 or better on `--sheet` in light and 5.4:1 in dark; check that again before swapping either.
- Dependencies are pinned to exact versions, so add new ones with an exact version too. They were installed with `npm install --before=<date>`, which skips releases newer than that date.

## Deploying

`.github/workflows/deploy.yml` tests, builds and publishes on every push to `main`. That only works while Settings > Pages > Source is "GitHub Actions". If the page goes blank and https://lambdanotfound.github.io/practice/package.json loads, the setting is back on "Deploy from a branch", which publishes the raw source. A run named "pages build and deployment" in the Actions tab gives the same sign. After a push, check the live page before reporting it as working.

## Testing

- `cd practice && npm test` runs the pure logic in `src/lib/`. `npm run build` type-checks too.
- For a change to the UI, build with `VITE_DATA_BASE` pointing at fixture copies of the three data files. Then drive it in a headless browser at 1280 px and 390 px, light and dark. Check that nothing scrolls sideways at 390 px, the word rule holds, and the log link's title and body come out right. Block requests to github.com and api.github.com so a test never opens a real issue; answer the API's POST with a fake issue to check "Log now". For "Show code", serve GoCode's working tree as the data: the panel must not exist, and no solution file or shiki chunk may load, before the first click.

## Commits

Same format as GoCode: `MM-DD-YYYY: <short description>`, at most 72 characters, local date. No hook enforces it here.
