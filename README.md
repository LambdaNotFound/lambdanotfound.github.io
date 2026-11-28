# lambdanotfound.github.io

Personal site, published by `.github/workflows/deploy.yml` on every push to `main`.

## Daily Practice (`practice/`)

https://lambdanotfound.github.io/practice/ shows the day's practice plan, grade buttons for each problem, a "Show code" button that reveals your own solution, and a board of every problem shaded by how well it should still be remembered.

There is no backend. The plan is picked once a day, usually between midnight and 4 AM Pacific, by `spaced_repetition/sr.py` in [GoCode](https://github.com/LambdaNotFound/GoCode) and recorded in its `state.json`; the page reads that file and `problems.json` straight from GoCode on each visit (GitHub caches them for about five minutes). "Show code" fetches the solution file that GoCode's README links for the problem, cuts out that problem's part (`src/lib/snippet.ts`) and highlights it with shiki; nothing is fetched, and shiki is not loaded, until the button is pressed. Logging opens a prefilled GitHub issue titled "Practice log YYYY-MM-DD" in GoCode; once you submit it, GoCode's `log-solve` workflow logs the grades, replies and closes the issue. With a GitHub token saved under "Set up one-tap logging" (fine-grained, the GoCode repository only, Issues: Read and write), "Log now" creates that same issue through GitHub's API, with no form to submit. Grades not yet sent and the token are kept in this browser's localStorage. A sent problem has a "Grade again" link for a form closed unsubmitted or a grade to change; GoCode keeps the last log of a problem on a day.

### The Design tab

The rail on the left switches between Coding (the plan above) and Design. Design shows the system designs from [system-design](https://github.com/LambdaNotFound/system-design): each `design-doc/<slug>/rfc.md` there, laid out in the order of a system design interview (requirements, core entities, API, data flow, high-level design, deep dives), with each requirement ID a chip that shows its text, Mermaid diagrams drawn in the browser, and each deep dive's chosen option above the ones it rejected. The content is copied in when the page is built: the deploy workflow checks out system-design into `practice/designs-src/` and Vite bundles the RFCs. The deploy runs daily as well as on every push here, so a design pushed to system-design shows up by the next morning, or at once from "Run workflow".

```bash
cd practice
git clone https://github.com/LambdaNotFound/system-design designs-src   # optional: the Design tab's content
npm ci
npm run dev     # http://localhost:5173/practice/, reading the live data
npm test        # Vitest, pure logic in src/lib/
npm run build   # type check, then build to practice/dist
```

`VITE_DATA_BASE=http://localhost:8000/ npm run build` makes a build that reads the data from another base URL, for testing against fixture files.

One-time setup: in the repository's Settings > Pages, set Source to "GitHub Actions".
