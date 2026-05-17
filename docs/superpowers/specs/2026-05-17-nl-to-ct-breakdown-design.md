# NL to CT Breakdown — Design

**Date:** 2026-05-17
**Author:** od@ebright.my (via brainstorming session)
**Status:** Approved for planning

## Summary

A new module under the existing **Testing Purposes Only (dnft)** card that visualises the weekly "NL to CT Breakdown" tracking sheet (Google Spreadsheet `1GgZRY2MS8m4BJX2lzww-eEkIXcdJV8sLMURGu-ai4QQ`). Each week, the operator registers that week's tab gid; our dashboard mirrors the tab and lets the operator freeze ("capture") each time-slot's Actual values so they remain stable for week-over-week comparison even if the sheet is later edited.

## Goals

- Visualise the live state of a registered weekly tab in three layouts (mirror grid, per-branch cards, per-slot tiles).
- Let the operator manually lock the **Actual** numbers per time slot so they don't shift retroactively.
- Show the immediately-prior registered week alongside the current week, toggleable on/off.
- Self-service tab registration via gid — no code change to add a new week.

## Non-goals

- Audit history of capture overwrites (overwriting is silent — only `captured_at` updates).
- Manual editing of captured Actuals (re-capture instead).
- Notifications / cron when a slot's nominal time arrives.
- Comparing against arbitrary weeks — comparison is always the immediately-prior registered week.
- CSV/PDF export.

## Decisions (from brainstorming)

| # | Decision | Choice |
|---|---|---|
| 1 | Snapshot trigger | Manual "Capture now" button |
| 2 | Tab meaning | One tab = one week |
| 3 | Capture scope | One button per time slot, locks all 20 branches' Actuals for that slot |
| 4 | Cells captured | **Actual only**. NL, CT @ 40%, Goal, QAQC are read live every page load |
| 5 | Spreadsheet scope | Always the same hardcoded spreadsheet ID |
| 6 | Branches/slots stability | Hardcoded layout (20 branches × 8 time slots) |
| 7 | Config UI placement | Two separate links in the Testing card |
| 8 | View layouts | All three (grid / cards / tiles), togglable |
| 9 | Previous-week display | Page-level "Show last week" toggle |
| 10 | Week navigation | Dropdown selector |
| 11 | Tab-name format | `YYYYMMDD` prefix (tolerant parser: matches `^\d{8}`, ignores suffix) |
| 12 | Sheet access method | **Deferred.** Backend uses a pluggable reader interface so either public CSV export or service-account Sheets API can be selected via env var. |

## High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Testing card (DashboardHomePage)                                │
│   existing links + two new ones:                                │
│     "Testing NL to CT Breakdown"   → /nl-to-ct                  │
│     "Manage NL to CT Tabs"         → /nl-to-ct/manage           │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ Frontend pages (React)                                          │
│   NlToCtBreakdownPage.tsx                                       │
│   NlToCtTabsPage.tsx                                            │
└─────────────────────────────────────────────────────────────────┘
                          │ REST
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ Backend (Express)                                               │
│   routes/nlToCt.js          — REST endpoints                    │
│   lib/sheetsReader.js       — pluggable reader + cache          │
│   lib/nlToCtSchema.js       — BRANCHES + TIME_SLOTS constants   │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ Postgres (Prisma)                                               │
│   nl_to_ct_tabs                                                 │
│   nl_to_ct_captures                                             │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
                Google Sheet (live reads of NL/CT/Goal/QAQC)
```

## Data model

### `nl_to_ct_tabs`

One row per registered weekly tab.

| column      | type      | notes |
|-------------|-----------|-------|
| `id`        | int PK    |       |
| `gid`       | text UQ   | the page id pasted by the user |
| `tab_name`  | text      | full title fetched from sheet metadata at registration time (e.g. `20260513`) |
| `week_date` | date UQ   | parsed from `tab_name` (`YYYYMMDD` prefix). Unique → can't register two tabs for the same week |
| `added_by`  | int FK    | user id |
| `added_at`  | timestamp |       |

### `nl_to_ct_captures`

Frozen `Actual` values for one (tab, time slot, branch).

| column        | type      | notes |
|---------------|-----------|-------|
| `id`          | int PK    |       |
| `tab_id`      | int FK    | → `nl_to_ct_tabs.id`, cascade delete |
| `slot_key`    | text      | one of 8 fixed values (see TIME_SLOTS) |
| `branch_code` | text      | one of 20 fixed values (see BRANCHES) |
| `actual`      | int       | the locked yellow number |
| `captured_by` | int FK    | user who pressed Capture |
| `captured_at` | timestamp |       |
| **unique**    |           | `(tab_id, slot_key, branch_code)` — re-press upserts |

### Hardcoded constants (`backend/src/lib/nlToCtSchema.js` and mirror in `frontend/src/lib/nlToCtSchema.ts`)

```js
exports.BRANCHES = [
  // 20 entries, in display order, with row position in the sheet
  { code: 'ONL', row: 3 }, { code: 'ST',  row: 4 }, { code: 'SA',  row: 5 },
  { code: 'SP',  row: 6 }, { code: 'KD',  row: 7 }, { code: 'PJY', row: 8 },
  { code: 'AMP', row: 9 }, { code: 'CJY', row: 10}, { code: 'KLG', row: 11},
  { code: 'DA',  row: 12}, { code: 'BBB', row: 13}, { code: 'DK',  row: 14},
  { code: 'SHA', row: 15}, { code: 'BTHO',row: 16}, { code: 'EGR', row: 17},
  { code: 'BSP', row: 18}, { code: 'RBY', row: 19}, { code: 'TSG', row: 20},
  { code: 'KW',  row: 21}, { code: 'KTG', row: 22},
];

exports.TIME_SLOTS = [
  // 8 entries, in display order
  { key: 'wed_4_30pm',  day: 'Wed', time: '4:30PM',  goalCol: 'E', actualCol: 'F', qaqcCol: null,  paramCell: 'E1' },
  { key: 'wed_5_30pm',  day: 'Wed', time: '5:30PM',  goalCol: 'G', actualCol: 'H', qaqcCol: 'I',   paramCell: 'G1' },
  { key: 'thu_12_30pm', day: 'Thu', time: '12:30PM', goalCol: 'K', actualCol: 'L', qaqcCol: 'M',   paramCell: 'K1' },
  { key: 'thu_5_30pm',  day: 'Thu', time: '5:30PM',  goalCol: 'N', actualCol: 'O', qaqcCol: 'P',   paramCell: 'N1' },
  { key: 'thu_7_00pm',  day: 'Thu', time: '7:00PM',  goalCol: 'Q', actualCol: 'R', qaqcCol: 'S',   paramCell: 'Q1' },
  { key: 'fri_12_30pm', day: 'Fri', time: '12:30PM', goalCol: 'U', actualCol: 'V', qaqcCol: null,  paramCell: 'U1' },
  { key: 'fri_4_30pm',  day: 'Fri', time: '4:30PM',  goalCol: 'W', actualCol: 'X', qaqcCol: 'Y',   paramCell: 'W1' },
  { key: 'fri_6_30pm',  day: 'Fri', time: '6:30PM',  goalCol: 'Z', actualCol: 'AA',qaqcCol: null,  paramCell: 'Z1' },
];
```

> Exact row/column letters will be verified against the live sheet during implementation. The QAQC column presence per slot mirrors the screenshot — some slots have a QAQC column, others don't.

## Backend

### Sheet reader abstraction — `backend/src/lib/sheetsReader.js`

Pluggable interface:

```js
async function readTab({ spreadsheetId, gid }) // → { tabTitle, rows: string[][] }
```

Two implementations:

- **csvReader** — fetches `https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<gid>` via `fetch`. Tab title comes from a follow-up call to the public sheet metadata, or from a manual override on registration if metadata isn't reachable.
- **serviceAccountReader** — uses `googleapis` with a service account key file (env var `GOOGLE_APPLICATION_CREDENTIALS`). Reads cell values and tab title in one `spreadsheets.get` call.

Selection: env var `NL_TO_CT_SHEET_READER=csv|serviceAccount` (default `csv`).

**Cache:** in-process LRU keyed by `(spreadsheetId, gid)`, TTL 30 seconds. Manually invalidated when the user presses Capture (so the follow-up render shows the just-captured value).

### Routes — `backend/src/routes/nlToCt.js`

All endpoints gated by the existing `requireDashboard('testing')` middleware.

| Method | Path | Body / Params | Behaviour |
|---|---|---|---|
| `GET`  | `/api/nl-to-ct/tabs`              | — | List `{ id, gid, tab_name, week_date, added_by, added_at }`, sorted by `week_date DESC` |
| `POST` | `/api/nl-to-ct/tabs`              | `{ gid }` | Validate gid by calling reader; parse `week_date` from tab title; reject if name doesn't start with 8 digits or if `week_date` already exists; insert |
| `DELETE` | `/api/nl-to-ct/tabs/:id`        | — | Delete tab + cascade captures |
| `GET`  | `/api/nl-to-ct/tabs/:id/data`     | — | Live read merged with frozen Actuals. Shape: `{ tab, branches: [{ code, nl, ct, slots: [{ slot_key, goal, actual_live, actual_captured, captured_at, qaqc }] }], parameters: { [slot_key]: 0.5 \| 0.55 \| … } }` |
| `POST` | `/api/nl-to-ct/tabs/:id/capture`  | `{ slot_key }` | Read current sheet, upsert 20 captures (one per branch), invalidate cache, return updated `/data` payload |
| `GET`  | `/api/nl-to-ct/tabs/:id/previous-week` | — | Same shape as `/data` for the tab whose `week_date` is the largest value `< this tab's week_date`. 404 if none. |

## Frontend

### Pages

| File | Route | Purpose |
|---|---|---|
| `NlToCtTabsPage.tsx`         | `/nl-to-ct/manage` | Register / list / delete weekly tabs |
| `NlToCtBreakdownPage.tsx`    | `/nl-to-ct`        | Visualise (grid / cards / tiles) |

### `NlToCtTabsPage.tsx`

- Input: paste gid → "Add tab" button.
- Table of registered tabs: `Week date` (formatted) · `Tab name` · `gid` · `Added` · trash icon.
- On add: inline error if gid is bad / week already registered / tab name doesn't match `^\d{8}`.
- On delete: confirmation dialog naming the week being removed and the capture count that will be lost.

### `NlToCtBreakdownPage.tsx`

Header row:
- `Week:` dropdown (registered tabs, latest selected by default, label `13 May 2026` or `13 May 2026 (20260513)` if a suffix is later added)
- `View:` segmented control `[Grid] [Cards] [Tiles]`
- `Show last week` toggle (disabled with tooltip if no prior tab exists)

Shared data hook fetches `/data` for the selected tab (and `/previous-week` when the toggle is on). All three view modes are pure renderers over the same hook's payload.

#### Grid view

Mirrors the sheet exactly: branches as rows, time slots grouped by day (Wed / Thu / Fri) as column groups. Each time-slot column group contains:

- Column header with day + time and a **Capture slot** button (labelled "Re-capture" with a warning tint if any captures exist for that slot).
- Sub-columns: `Goal` (white live value), `Actual` (frozen value when captured, else live live-tinted value), `QAQC` (if applicable).

Conditional formatting (matches the sheet):
- Cell green if `actual >= goal`
- Cell yellow if `0 < actual < goal`
- Cell red if `actual === 0` past the slot's nominal time-of-day

When "Show last week" is on, each Actual cell renders three lines: this week / last week (greyed) / Δ in green or red.

#### Cards view

One card per branch. Inside: branch code, NL, CT, and a bar chart of Goal vs Actual across the 8 slots. With "Show last week" on, last week's Actual is overlaid as a thinner second bar series.

#### Tiles view

Top section: 8 large tiles, one per slot. Each tile shows `Wed 4:30PM — 162/178 (91%)` and a small `Last week: 145/170 (85%)` subtitle when the toggle is on.

Bottom section: the same grid as Grid view, but read-only (no Capture buttons).

### Capture interaction

- Click "Capture slot" → modal showing the slot name, the 20 branches and their current Actual readings from the sheet, and a `[Confirm capture]` button.
- If captures already exist: modal shows existing frozen value vs. current sheet value side-by-side per branch, with a banner: *"Re-capture will overwrite N existing captures (previously captured by X at YYYY-MM-DD HH:mm). Continue?"*.
- On confirm: POST `/tabs/:id/capture`, then the page auto-refreshes its data hook.

### State management

Use whichever data-fetching library the existing pages use (likely React Query or a custom hook on `fetch`). No new global store.

## Permissions & routing

- Both pages and all six API endpoints sit behind the existing `requireDashboard('testing')` middleware (same gate as Branch Performance / To Tally / UI/UX Testing).
- Anyone who currently sees the Testing card on the home page can use both new links.
- New routes added to `App.tsx`.
- New links added to `DashboardHomePage.tsx` in the existing `testing` department entry (~line 176, inside the `links` array).

## Edge cases

| Situation | Behaviour |
|---|---|
| gid doesn't exist in the spreadsheet | Form: "Tab not found. Double-check the gid." |
| Tab name doesn't start with `YYYYMMDD` | Form: "Tab name must start with YYYYMMDD." Tab not saved. |
| Two registrations for the same week | DB unique constraint → UI: "Week 13 May 2026 is already registered." |
| Capture before any value is in the sheet | Empty cells captured as 0. Intentional. |
| Re-capture | Modal confirmation with side-by-side diff. |
| Selected week has no prior tab | "Show last week" toggle visible but disabled, tooltip: "No earlier week registered." |
| Sheet read fails on visualisation | Banner: "Live sheet read failed — showing frozen captures only." Frozen Actuals still render; Goal/QAQC show `—`. |
| Delete tab | Confirmation: "Delete week DD MMM YYYY and its N captures? This can't be undone." |
| Parameter row missing or non-numeric | Goal column renders `—`. No crash. |

## Implementation notes

- Verify the exact row and column letters in `BRANCHES` / `TIME_SLOTS` against the live sheet before wiring up captures. The values in this spec are best-effort from the screenshots.
- The `paramCell` field per slot is used to read the parameter (0.5, 0.55, 0.7, 0.8, 0.9, 0.95, 1) from row 1 — only needed if the live Goal value ever turns out to be wrong and we want to fall back to recomputing `goal = round(nl * param)`. Otherwise just use the sheet's Goal column directly.
- The cache key includes `gid` so the same spreadsheet's different tabs cache independently.

## Open items

- **Sheet access method.** Deferred. Default to `csv` reader at launch; switch to service-account if the sheet has to become non-public or if the CSV export hits rate limits.
- **Exact row/column letters.** Confirmed during implementation against the actual sheet.
