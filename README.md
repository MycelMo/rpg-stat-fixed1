# RPG Stat

Personal RPG-style productivity website. Static React + Vite app; all data is stored in your browser.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # rule tests (25)
npm run build      # type-check + production build into dist/
npm run e2e        # real-browser check (needs `npm run build` and Chromium; see e2e/run.mjs)
```

## Deploy on Vercel (free Hobby plan)
1. Push this folder to a GitHub repository.
2. On vercel.com → **Add New… → Project** → import the repo. Vercel detects Vite automatically
   (build `npm run build`, output `dist`). No environment variables, no `vercel.json` needed.
3. Deploy; you get a `*.vercel.app` URL. Alternatively: `npm i -g vercel && vercel` in this folder.

## Project map
- `src/logic/` — pure rules (progress, priority, levels, ledger, scheduler, capacity) — all unit-tested.
- `src/store/reducer.ts` — every state change (quests, weeks/rollover, sessions, shop). `storage.ts` — localStorage.
- `src/pages/`, `src/components/` — UI.
- `DECISIONS.md` — **read this first**: every rule that was not fully specified, and what v1 does.

Stages: I core (board, quests, progress, archive, storage) · II XP/levels/crystals/shop ·
III free windows/scheduler/capacity · IV prompts, defer log, rollover. Tests in `src/test/rules.test.ts` are grouped by stage.

## Deploying from GitHub (checklist)
The repository root must contain `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `scripts/` **and the whole `src/` folder
with its sub-folders** (`components`, `logic`, `pages`, `store`, `test`). If `src/` is missing, `tsc` fails with
`TS18003: No inputs were found in config file`; `npm run build` now runs `scripts/check-sources.mjs` first and explains this.
Do not pick files one by one in the GitHub web uploader (it drops folders). Use `git add -A && git commit -m "RPG Stat" && git push`,
or drag the unzipped folder's *contents* onto the uploader. Verify with `git ls-files src | wc -l` (about 31).
Vercel settings: Framework Preset "Vite", build command `npm run build`, output directory `dist` (all auto-detected).
