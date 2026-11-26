# lambdanotfound.github.io

Personal site, published by `.github/workflows/deploy.yml` on every push to `main`.

## Daily Practice (`practice/`)

https://lambdanotfound.github.io/practice/ shows the day's practice plan, a timer and grade buttons for each problem, and a board of every problem shaded by how well it should still be remembered.

There is no backend. The plan is picked once a day, from 3 PM Pacific, by `spaced_repetition/sr.py` in [GoCode](https://github.com/LambdaNotFound/GoCode) and recorded in its `state.json`; the page reads that file and `problems.json` straight from GoCode on each visit (GitHub caches them for about five minutes). Logging opens a prefilled GitHub issue titled "Practice log YYYY-MM-DD" in GoCode; once you submit it, GoCode's `log-solve` workflow logs the grades, replies and closes the issue. Timers and grades not yet sent are kept in this browser's localStorage.

```bash
cd practice
npm ci
npm run dev     # http://localhost:5173/practice/, reading the live data
npm test        # Vitest, pure logic in src/lib/
npm run build   # type check, then build to practice/dist
```

`VITE_DATA_BASE=http://localhost:8000/ npm run build` makes a build that reads the data from another base URL, for testing against fixture files.

One-time setup: in the repository's Settings > Pages, set Source to "GitHub Actions".
