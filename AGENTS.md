# AGENTS.md — Z-Drive (Kenya MTB Driving School Simulator)

## Commands (exact, verified)

| Task | Command | Notes |
|------|---------|-------|
| Install | `npm ci` | Use `npm ci` (not `install`) in CI; `npm install --legacy-peer-deps` locally only if needed |
| Dev server | `npm run dev` | Vite on :5173 |
| Type check | `npx tsc --noEmit` (or `npm run typecheck`) | `strict: true`, `noUnusedLocals`, `noUnusedParameters` — no unused vars allowed |
| Lint | `npm run lint` | ESLint flat config at `eslint.config.js`; **0 warnings required** |
| Lint fix | `npm run lint:fix` | |
| Format | `npm run format` / `npm run format:check` | Prettier |
| Tests | `npm run test` | Vitest + jsdom, tests at `src/**/*.test.{ts,tsx}` |
| Build | `npm run build` | Vite + `vite-plugin-singlefile` → single `dist/index.html` |
| Preview | `npm run preview` | |
| Verify all | `typecheck → lint → test → build` | Same order as CI (`.github/workflows/ci.yml`) |

## Critical quirks (would break without this)

- **`vite-plugin-singlefile` must stay at `^2.3.0`.** Bumping to `0.9.0` breaks the Vite 7 build (`Cannot read properties of undefined (reading 'call')` in `applyHtmlTransforms`). Never run `npm audit fix --force` on this package.
- **`eslint-plugin-react` is incompatible with ESLint 10.** It was removed from `devDependencies`; do not re-add it.
- **`@` alias resolves to `src`.** Use `import ... from '@/game/engine'` etc.
- **Build output is single-file HTML.** `dist/index.html` is the deployable artifact (inlined JS + CSS). Vercel deploy command: `vercel deploy --prod --name z-drive-driving-school-simulator`.
- **Node version 22** (CI uses `actions/setup-node@v4` with `node-version: 22`).

## Architecture (one-paragraph entrypoint)

Single-page React app: `src/main.tsx` mounts `src/App.tsx` under an `ErrorBoundary`. `App.tsx` drives screens (menu/vehicle/challenges/playing/results/theory/…). The game engine lives in `src/game/engine.ts` (Three.js renderer + traffic + rules + physics + audio), instantiated once and held in React state. Maps/routes live in `src/game/map.ts`; vehicle specs/rigs in `src/game/vehicles.ts`; progression/licensing/leaderboard in `src/game/progression.ts` (persisted to `localStorage` key `zdrive_ntsa_progression_v2`). UI in `src/ui/` (HUD, MapCanvas, Results, Theory).

## Lint rules that differ from defaults

- `react-hooks/set-state-in-effect` and `react-hooks/immutability` are **off** — the Three.js engine is imperative and mutates by design.
- `@typescript-eslint/no-non-null-assertion` is **off** — `!` is intentional throughout Three.js/game code (refs/scene children guaranteed non-null after mount). Strict TS still catches real type errors.
- `no-console` is `warn` (allows `error`/`warn`).

## Testing

- Vitest with jsdom, `globals: true`, setup at `src/tests/setup.ts` (imports `@testing-library/jest-dom`).
- Run one file: `npx vitest run src/tests/progression.test.ts`.
- `src/utils/cn.ts` exists but is unused — do not import it unless actually needed.
- `engine.ts` re-exports `halfWidth` at its bottom — do not add a duplicate export.

## Do not commit

- `node_modules/`, `dist/`, `.env*`, `.vercel`, coverage, IDE files (see `.gitignore`).
