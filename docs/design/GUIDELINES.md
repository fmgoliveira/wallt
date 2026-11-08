# Wallt — Design Guidelines

Status: **Draft for owner review** (rev. 2, 2026-11-08). Applies to Android (Expo) and web. Extends plan §9 and ADR 0004 and
**replaces** parts of them (palette, font, radii, gradient rule); each replacement is marked ⚠. Visual reference: [`reference.html`](reference.html).

Tokens live in `packages/ui/src/tokens.ts`; this document says **how to use them**. If a value is missing, add a token — never hard-code hex, px or ms in screens.

---

## 1. Principles

1. **Cool neutrals.** The UI is blue-tinted greyscale. Colour carries meaning only: green = money in / success, red = over budget / error.
2. **Crisp depth, not flatness.** Every surface has an edge: 1 px hairline, a 1 px top highlight and a soft layered shadow. Layers read by light, not by colour.
3. **Numbers first.** Amounts are the content: large, tight, tabular, never truncated.
4. **Precise, not soft.** Tighter radii, tighter tracking, compact controls on desktop. Nothing pill-shaped unless it is a status chip.
5. **One language, native layouts.** Same tokens and components everywhere; layout adapts (§9.2). Web is a desktop app.

---

## 2. Colour ⚠ (replaces the indigo palette)

### 2.1 Semantic palette
| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#f4f5f7` | `#0a0c0f` | Page, under the backdrop |
| `surface` | `#ffffff` | `#12151a` | Cards, list groups, table body |
| `elevated` | `#ffffff` | `#191d24` | Sheets, menus, popovers, active segment, icon tiles |
| `border` | `#e4e7ec` | `#23282f` | Hairlines, dividers |
| `borderStrong` | `#d3d8e0` | `#2e343d` | Inputs, secondary buttons, outer edges |
| `text` | `#0c1118` | `#eef1f5` | Primary text |
| `muted` | `#5b6573` | `#8b95a5` | Secondary text |
| `subtle` | `#8a94a3` | `#5f6978` | Decimals, section labels, inactive icons (**not** for body text: below AA, decorative/large only) |
| `accent` / `accentFg` | `#1d2532` / `#fff` | `#e8edf3` / `#0a0c0f` | Primary action (near-black in light, near-white in dark) |
| `data` | `#41618a` | `#8fa8c9` | Charts' main series, focus ring, selected row, links — the only "blue" |
| `positive` | `#0f8a4f` | `#3fcf8e` | Income, under budget, success |
| `negative` | `#d1293d` | `#f2606f` | Over budget, errors, destructive |
| `warning` | `#a15c00` | `#f0b54a` | Near limit, needs review |

Values are a starting point; the contrast tests in `tokens.test.ts` decide (AA for text tokens, 3:1 for UI).

### 2.2 Rules
- **No user-selectable brand accent by default.** The greyscale theme is the identity. ⚠ Plan §9.1 says "1 accent color, user-selectable": proposal is to keep the setting but only for `data` (charts/focus), with steel blue as default. *Owner decides in #79.*
- **Money colour:** expenses in `text` with `−`; income in `positive` with `+`; `negative` only for problems (overspend, failed sync, errors). Never colour a normal expense red.
- **Category colours** appear only as a 6 px rounded-square dot or a chart segment — never as filled icon tiles. Icon tiles are neutral (`elevated` + hairline).
- Tints over surfaces use alpha, not new hexes: hover `text/5`, selected `data/10`, status chip fill `positive|negative|warning/12`.

---

## 3. Gradients & depth ⚠ (replaces ADR 0004's "gradients in three places")

Gradients are **monochrome and subtle**: they add light and dimension, never colour.

| Token | Definition | Used for |
|---|---|---|
| `heroGradient(scheme)` | 160°: `#1d2532 → #0e131a` light / `#2b3442 → #151a21` dark, plus a radial `data/22` light spot top-right | Net-worth hero, logo mark, onboarding hero. White text. |
| `actionGradient(scheme)` | 180°: `#3a4658 → #1d2532` light / `#ffffff → #d5dde7` dark | Primary button, add button |
| `surfaceGradient(scheme)` | 180°: `surface` → 1–2 % darker | Cards (barely visible — it removes the "flat" look) |
| `areaGradient(color)` | `color/30 → color/0` vertical | Chart area fills, hero sparkline |
| `progressGradient` | `subtle → text` (on-track) · `negative/60 → negative` (over) | Budget/goal bars |
| `glow` | 2 large, blurred, **desaturated slate-blue** blobs, alpha ≤ 0.9 of `#2c3a50`/`#1c2636` (dark), `#b9c6d8`/`#d5dde8` (light) | Page backdrop only |

**Depth recipe (every raised surface):** `1px border` + `inset 0 1px 0 highlight` (white/6 dark, white/90 light) + layered shadow
(light: `0 1px 2px rgb(16 24 40/.05), 0 6px 20px -8px rgb(16 24 40/.10)`; dark: `0 1px 2px rgb(0 0 0/.4), 0 12px 32px -16px rgb(0 0 0/.7)`).
Optional on web hero/marketing areas: a faint 48 px grid masked to fade out from the top.

Never: saturated or multi-hue gradients, gradients on text, rows, inputs or nav bars.

---

## 4. Glass

Glass = translucent fill + hairline + top highlight + backdrop blur, via `GlassSurface` (web `backdrop-filter: blur() saturate(1.6)`, Android `BlurView`, fallback translucent fill).

| Surface | Fill | Blur |
|---|---|---|
| Bottom tab bar, nav rail, sidebar | `surface` @ 74 % light / 66 % dark | 24 px web · intensity 50 native |
| Sheets, modals, popovers, ⌘K palette | `elevated` @ 86 % / 80 % | 32 px · 60 |
| Sticky headers, toasts | `bg` @ 74 % / `elevated` @ 86 % | 16–24 px · 40–50 |
| Cards, list groups, tables | **no glass** — solid `surfaceGradient` | — |

---

## 5. Typography ⚠ (Inter → Geist)

**Geist** (sans) for everything, **Geist Mono** for small uppercase labels (section headers, table headers, kbd hints). Self-hosted on both
platforms (`@expo-google-fonts/geist` or bundled `.ttf` — new dependency, approve in #79). **Tabular figures on every number.**

| Token | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 34 / 38 | 600 | −0.04 em | Hero balance |
| `heading` | 24 / 28 | 600 | −0.035 em | Screen titles, big stat values |
| `title` | 16 / 20 | 600 | −0.015 em | Card/sheet titles |
| `body` | 14 / 20 | 400–500 | −0.006 em | Default text, list primary line |
| `small` | 12.5 / 18 | 400–500 | 0 | Secondary lines, table cells, labels |
| `label` (mono) | 11 / 16 | 500 | +0.06 em, uppercase | Section labels, table headers |

Weights: 400 body, 500 UI/emphasis, 600 headings and amounts. No 700+.

### 5.1 Amounts (`<Amount>`)
- Integer in the text colour; decimals in `subtle` (or 60 % of the colour for coloured amounts); currency symbol same size, same colour as integer.
- Large amounts get the tightest tracking (−0.04 em). Always tabular, right-aligned in lists/tables.
- `−` for expenses, `+` for income; privacy mode = `••••` with the same width; number ticker on change (§8).

---

## 6. Layout, spacing, shape ⚠ (radii reduced)

- **4-pt grid.** Steps 4, 8, 12, 16, 20, 24, 32, 48.
- **Screen padding:** 14–16 phone · 24 tablet · 32 desktop. Max width 1280 (dashboard), 720 (forms/settings).
- **Card padding:** 14–16 phone, 18–20 tablet+. Gaps 10–12 phone, 16 desktop.
- **Radius:** `sm 6` chips, kbd, small controls · `md 8` buttons, inputs, icon tiles, segments · `lg 12` cards, hero, menus · `xl 16` sheets, modals, floating tab bar · `full` avatars only.
  Nested radius = outer − padding.
- **Control height:** 36 desktop web, 44 touch (Android, phone web). Touch targets ≥ 44 px always.

---

## 7. Components

**Button** — `primary` (`actionGradient`, `accentFg`, top highlight, 1 px shadow) · `secondary` (`elevated`, `borderStrong` ring, highlight) · `ghost` (`muted` text, `text/5` hover) · `destructive` (light: red gradient, white text; dark: `negative/14` fill, red text + ring). One primary per view. Press: scale 0.98. Optional trailing `kbd` hint on web (`N`).

**Add button** — phone: centred in the glass tab bar, 44×40, `radius md`, `actionGradient`. Tablet/desktop: primary button in the header/sidebar with `N` hint. No floating circle FAB.

**Input / AmountInput / Select** — no visible border fill change; ring-based: `0 0 0 1px borderStrong`. Focus: `1px data` + `4px data/22` halo. Error: same with `negative`. Dark inputs sit on `bg` (inset look). Labels above, `small muted`.

**Card** — `surfaceGradient`, depth recipe, `radius lg`. Title `title`, optional ghost action right.

**HeroCard** — `heroGradient`, white text, balance `display`, delta chip (`positive/14` fill), optional `areaGradient` sparkline bottom-right. Max one per screen.

**ListItem** — 60 px (two-line) / 48 px (one-line). Neutral 36 px icon tile, primary `body` 500, secondary `small muted` with category dot, trailing `<Amount>`. Inset dividers start after the tile. Day headers use `label` (mono).

**Table (web)** — 42 px rows, mono uppercase header, no zebra, hover `text/5`, selected `data/10` + 2 px `data` left bar, last row without border. Dates in `muted`.

**Segmented / Tabs** — track `text/5`, active segment `elevated` with depth recipe (looks raised), spring-animated.

**Progress** — 6 px, `radius 3`, track `text/6`, fill `progressGradient`; show the number underneath ("62 % of €2 070", "€12 over" in `negative`).

**Sheet / Modal / Toast** — glass levels from §4, `radius xl` (sheets) / `lg` (toasts), grab handle 32×4. Desktop modal ≤ 560 px or side panel 420 px; scrim `black/40` + 4 px blur.

**Charts** — main series `data` 2 px + `areaGradient`; comparison series `subtle` dashed; gridlines dashed `border`, solid baseline `borderStrong`; no vertical gridlines. Donut 12 px, 2 px gaps, category colours. Tooltips glass, privacy-aware.

**EmptyState** — 48 px `radius lg` raised badge (neutral, depth recipe) with a line icon, `title`, one `muted` line, one primary button.

**Skeleton** — `text/6` blocks matching layout, slow shimmer. **Icons** — Lucide, stroke 1.6, 18 px default (20 tab bar, 16 dense tables), always `muted`/`text`, never coloured.

---

## 8. Motion

Reanimated only. Short and crisp.

| Interaction | Spec |
|---|---|
| Entrance | Fade + 6 px rise, 180 ms, stagger 25 ms, max 8 items |
| Press | Scale 0.98, spring |
| Sheets / side panels | Spring in, 180 ms `exit` easing out |
| Segmented indicator, toggles | Spring; follows finger on Android |
| Number ticker | 500 ms `emphasized`; skip if off-screen |
| Progress / chart draw | 450 ms on first appear only |
| Backdrop glows | Static (no drift) — calmer and cheaper |

**Reduce motion:** 120 ms cross-fades only; no ticker, no stagger.

---

## 9. Platform specifics
- **Web:** hover on everything interactive; `:focus-visible` ring (`data` 2 px, offset 2); `kbd` hints on primary actions; thin `border`-coloured scrollbars; ⌘K palette in modal glass.
- **Android:** no ripple (press-scale + tint instead); edge-to-edge under glass bars; haptic tick on add, swipe actions and save.
- **Both:** theme follows system until chosen; light and dark are equally first-class.

## 10. Accessibility (non-negotiable)
AA for all text tokens (`subtle` is decorative/large-text only) · 3:1 for UI, category dots and chart series · 44 px targets · colour never the only signal (`+`/`−`, icons, labels) · labels on icon-only buttons · full keyboard flow on web · reduce motion · font scaling to 130 % without clipping amounts.

## 11. Do / Don't
| Do | Don't |
|---|---|
| Greyscale UI; colour only for money meaning | Tinted buttons, coloured nav, rainbow icon tiles |
| Hairline + top highlight + soft shadow on every raised surface | Flat fills without edges, or heavy drop shadows |
| Radii 6 / 8 / 12 / 16 | Pills everywhere, 20+ px card radii |
| Geist, tight tracking on big numbers, tabular figures | Proportional or centred numbers |
| One hero gradient per screen, everything else monochrome | Saturated or multi-hue gradients |
| Add a token when a value is missing | Hard-coded hex/px/ms in screens |

## 12. Review checklist (every UI PR)
- [ ] Only tokens; new tokens added to `tokens.ts` + contrast tests
- [ ] No colour outside `data` / `positive` / `negative` / `warning` / category dots
- [ ] Depth recipe on raised surfaces; glass only on floating layers
- [ ] Amounts via `<Amount>`; tabular; privacy mode OK
- [ ] Light + dark, 390 / 768 / 1280 screenshots (Android + web)
- [ ] Hover/focus (web), press feedback, reduce-motion path
