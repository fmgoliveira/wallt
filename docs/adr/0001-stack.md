# ADR 0001 — Stack and pinned versions

- Status: **Proposed — awaiting owner review (all ADRs must be approved before P1 dev and starts)**
- Issue: #7 · Plan: §2.1
- Related: [ADR 0002 — web local DB](0002-web-local-db.md) · [ADR 0003 — charts](0003-charts.md) · [ADR 0004 — styling](0004-styling.md)
  (these live in open PRs #63, #64 and #67 until merged, so the links resolve after those merge).

## Context
Plan §2.1 asked to pin exact versions after the P0 spikes. Versions below were looked up on npm on 2026-11-06.
**Installed** = already in the repo and verified by `pnpm lint/typecheck/test/build`. **Planned** = chosen here, installed by the task named
in the last column; re-check the latest compatible version at install time and update this file in that PR.
Mobile/native packages follow **Expo SDK 58's bundled versions** (not npm latest) so `expo install` stays consistent.

## Decisions carried over from the ADRs
| Topic | Decision | Source |
|---|---|---|
| Web data access | `Repository` interface is async-only; web uses a `RemoteRepository` first, Android uses local SQLite; local SQLite on web deferred | ADR 0002 (spike: expo-sqlite sync API times out on web; async OK) |
| Charts | `react-native-gifted-charts` (SVG) behind wrappers in `packages/ui` | ADR 0003 |
| Styling | NativeWind v4 (Tailwind 3) + Reanimated; Moti dropped; `expo-blur` + `expo-linear-gradient` for glass/gradients | ADR 0004 |
| Packages | `packages/*` are consumed as TypeScript source (no build step); `apps/server` builds with `tsc` | PR #62 |

## Tooling (installed)
| Area | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node | 26 (`.nvmrc`) | newest release line at the time (confirm LTS status before first deploy); pinned in `engines` |
| Package manager | pnpm | 12.18.0 (`packageManager`) | workspaces; strict `node_modules` (see ADR 0004 notes) |
| Task runner | Turborepo | 2.11.10 | cached typecheck/test/build |
| Language | TypeScript | 7.0.2 | strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; verified with Expo's base tsconfig |
| Lint/format | Biome | 2.6.6 | one fast tool; `noUnknownAtRules` off for Tailwind CSS when added |
| Unit tests | Vitest | 5.1.0 | runs in every package; @vitest/coverage-v8 5.1.0 in `packages/core` (100% gate on money.ts) |

## App (`apps/app`)
| Dependency | Version | Status | Why / note |
|---|---|---|---|
| expo | 58.0.23 | installed | SDK 58 |
| expo-router | ~58.0.30 | installed | file-based routing, static web export |
| react / react-dom | 19.3.0 | installed | per SDK 58 |
| react-native | 0.88.1 | installed | per SDK 58 |
| react-native-web | ~0.21.4 | installed | web target |
| expo-constants, expo-linking, expo-status-bar | ~58.0.15 / ~58.0.16 / ~58.0.4 | installed | router peers |
| react-native-safe-area-context / react-native-screens | ~5.11.1 / ~4.30.1 | installed | router peers |
| nativewind | 4.2.7 | planned (P2.1) | ADR 0004 |
| tailwindcss | 3.4.19 | planned (P2.1) | NativeWind v4 needs Tailwind 3 (npm `latest` is 4.x: do **not** upgrade) |
| react-native-css-interop | 0.2.7 | planned (P2.1) | must be a direct dep under pnpm (ADR 0004) |
| react-native-reanimated | 4.7.1 | planned (P2.1) | animations |
| react-native-worklets | 0.13.0 | planned (P2.1) | Reanimated peer; Expo-bundled version |
| expo-blur / expo-linear-gradient | ~58.0.5 / ~58.0.3 | planned (P2.1) | glass and gradients; blur on Android to be verified |
| react-native-gifted-charts + react-native-svg | 1.4.81 + 15.16.0 | planned (P4.4) | ADR 0003; svg per Expo bundle |
| expo-sqlite | ~58.0.15 | planned (P2.3, Android only) | local DB; async API only |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 | in use (P1.2) | schema + migrations shared by app and server |
| @tanstack/react-query | 5.106.1 | planned (P2) | server/derived data |
| zustand | 5.1.0 | planned (P2.1) | UI state, owned colour scheme |
| react-hook-form + @hookform/resolvers | 7.91.0 + 7.0.3 | planned (P2.6) | forms |
| zod | 4.6.7 | in use (P1.1, `packages/core`) | shared validation |

## Server (`apps/server`)
| Dependency | Version | Status | Why / note |
|---|---|---|---|
| hono + @hono/node-server | 4.13.16 + 2.1.6 | in use (P1.3) | small API server |
| better-sqlite3 | 13.0.3 | in use (P1.3) | SQLite (WAL); native addon, must build in the Docker image |
| croner | 11.0.0 | in use (P1.3) | in-process jobs |
| pino | 10.4.0 | in use (P1.3) | structured logs |
| esbuild / tsx | 0.28.2 / 4.23.15 | in use (P1.5) | esbuild bundles the server for the image; tsx runs the server dev and start scripts |
| argon2 | 0.45.2 | planned (P1.4) | password hashing (native addon); owner-review task |
| age-encryption | 0.3.1 | planned (P1.6) | backup encryption (pure JS); owner-review task |

## Testing
| Tool | Version | Status |
|---|---|---|
| fast-check | 4.10.2 | planned (P3.4) |
| @playwright/test | 1.65.0 | planned (P8.4) |
| Maestro | n/a (CLI) | planned (P8.4) |

## Open points for the owner
1. **Node 26 and TypeScript 7** are the newest releases, chosen in PR #59. They work with Expo/Biome/Vitest so far; not yet verified with
   Drizzle, Hono and `better-sqlite3`'s build. Acceptable, or pin Node 24 / TypeScript 5.x?
2. **Spreadsheet import (P5.1):** the plan says SheetJS, but the `xlsx` package on npm is stale (0.18.5, with known advisories); SheetJS
   publishes current builds from its own CDN. Options: install from the SheetJS CDN tarball, or use an alternative (e.g. ExcelJS). Needs a decision before P5.1; no action now.
3. **Native addons on the server** (`better-sqlite3`, `argon2`) need a build toolchain in the Docker image; alternatives exist (`node:sqlite`
   built into Node, `@node-rs/argon2`). I propose evaluating this inside P1.3/P1.4 rather than now.
4. ADRs 0002–0004 still need your approval/merge (the decisions are recorded as accepted in the ADRs, but the PRs are open).

## Decision
_Pending owner approval._

## Consequences
- Dependencies are added per task with the exact versions above (no ranges for third-party libs; Expo packages use Expo's `~` ranges as `expo install` writes them).
- Any change to a row requires updating this file in the same PR (plan §0: changing the stack needs the owner's approval).
