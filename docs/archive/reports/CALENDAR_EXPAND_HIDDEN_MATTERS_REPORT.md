# Calendar Month Grid: Expand "+N More" Hidden Matters & Date-Key Bug Fix Report

## 1. Executive Summary

This report documents the surgical fixes and feature enhancements implemented on branch `feature/calendar-expand-more`:
1. **Date-Key Timezone Bug Fix (Part 1)**: Resolved an off-by-one calendar cell date key bug in `Asia/Dhaka` (UTC+6) caused by `date.toISOString().slice(0, 10)` converting local midnight to previous day's UTC time. Introduced `formatLocalDateKey` in `src/utils/dateUtils.ts` and applied it to `daysInMonthGrid`, `goToToday`, `setSelectedDateStr`, and `todayStr`.
2. **Interactive "+N More" Expand & Collapse (Part 2)**: Replaced the static `<span>` with an accessible, interactive `<button type="button">` that toggles full event expansion in-place for cells with more than 3 matters, maintaining natural CSS grid row expansion, accessible keyboard navigation (`Tab`, `Enter`, `Space`), filter/month reset guards, and bilingual localization (`en.json` and `bn.json`).

All changes adhere strictly to Surgical Mode constraints. No changes have been committed or pushed, awaiting explicit approval.

---

## 2. Part 1 — Date Key Timezone Bug Fix

### Problem Analysis
`CalendarScreen.tsx` previously generated calendar date keys using `date.toISOString().slice(0, 10)`:
- In `daysInMonthGrid`, date objects are created via `new Date(year, month, i)` representing **local midnight (00:00:00)** on day `i`.
- In Bangladesh Standard Time (`Asia/Dhaka`, UTC+6), `00:00:00 +0600` corresponds to `18:00:00 UTC` on the **previous calendar day**.
- Consequently, calling `d.toISOString().slice(0, 10)` on `12 Nov 2026` produced `"2026-11-11"`, causing:
  - The cell visually labelled "12" to load events for November 11.
  - "Today" indicator to highlight the wrong cell between 00:00 and 06:00 AM.
  - `goToToday` and initial `selectedDateStr` to target the wrong day.

### Solution
- Added `formatLocalDateKey(date)` in `src/utils/dateUtils.ts` formatting standard `YYYY-MM-DD` from the Date object's local year, month, and date components (`getFullYear()`, `getMonth() + 1`, `getDate()`).
- Replaced all 6 instances of `toISOString().slice(0, 10)` in `CalendarScreen.tsx`:
  - `daysInMonthGrid`: Previous month padding, current month days, and next month padding.
  - `goToToday`: Today navigation handler.
  - Initial `selectedDateStr` state.
  - `todayStr` calculation.
- Created `tests/calendarDateKey.test.ts` verifying that under both `TZ=Asia/Dhaka` and `TZ=UTC`, the 12 Nov 2026 cell produces key `"2026-11-12"`, and explicitly proving the old `toISOString().slice(0, 10)` produced `"2026-11-11"` in `Asia/Dhaka`.

---

## 3. Part 2 — Expand "+N More" Hidden Matters (Tablet / Desktop, >= sm)

### Architecture & Behavioral Logic
1. **State Management**:
   - Added `const [expandedDateStr, setExpandedDateStr] = useState<string | null>(null);`. Only one date cell can be expanded at any time.
2. **Interactive "+N More" Button**:
   - Replaced static `<span>` with `<button type="button">`.
   - Minimum height: `min-h-[28px]`.
   - Accessibility: `aria-expanded="false"`, dynamic `aria-label` (e.g., `Show 9 more matters on 5 November`).
   - Styling: `hover:bg-indigo-50/70`, `hover:text-indigo-800`, visible focus indicator ring (`focus-visible:ring-1 focus-visible:ring-indigo-500`).
   - Click isolation: `onClick` executes `e.stopPropagation()` so expanding matters does not trigger parent cell selection, maintaining independent cell selection and matter expansion.
3. **In-Place Expansion & "Show Less"**:
   - When `dayObj.dateStr === expandedDateStr`, all `dayEvents` are rendered using identical badges, styling, click handlers (`handleEventClick`), and `data-testid` attributes.
   - The "+N more" button is hidden and replaced at the bottom with a "Show less" button (`<button type="button">` with `min-h-[28px]`, `aria-expanded="true"`, `ChevronUp` icon, and text `{t('calendar.showLess')}`).
   - Clicking "Show less" sets `expandedDateStr` to `null`.
4. **Single-Date Expansion**:
   - Clicking "+N more" on a different date immediately expands the new date and collapses the previously expanded date.
5. **State Reset Guards**:
   - Reset `expandedDateStr` to `null` on `prevMonth()`, `nextMonth()`, and `goToToday()`.
   - `useEffect(() => { setExpandedDateStr(null); }, [typeFilter])` cleanly resets expansion whenever the category filter changes.
6. **Layout & Responsiveness**:
   - Natural week row height expansion: CSS Grid (`grid-cols-7`) expands the entire row naturally without absolute positioning, clipping, or horizontal scroll.
   - Text truncation: `truncate` class ensures long case titles retain clean ellipses.
   - Mobile (`< sm`): Retained completely unchanged (dots and selected-day agenda list below).
7. **Bilingual Localization**:
   - Added `"showLess": "Show less"` in `src/locales/en.json`.
   - Added `"showLess": "কম দেখান"` in `src/locales/bn.json`.
   - Verified 100% key parity with `tests/i18nParity.test.ts`.

---

## 4. Files Changed

| File Path | Description of Changes |
| :--- | :--- |
| `src/utils/dateUtils.ts` | Added `formatLocalDateKey` helper extracting local date components (`YYYY-MM-DD`). |
| `src/modules/calendar/CalendarScreen.tsx` | Replaced `toISOString().slice(0, 10)` with `formatLocalDateKey`; implemented `expandedDateStr` state, interactive "+N more" expand button, and "Show less" collapse button. |
| `src/locales/en.json` | Added `calendar.showLess`: `"Show less"`. |
| `src/locales/bn.json` | Added `calendar.showLess`: `"কম দেখান"`. |
| `tests/calendarDateKey.test.ts` | Unit & timezone test verifying date key formatting under `TZ=Asia/Dhaka` and `TZ=UTC`. |
| `e2e/calendarExpandMore.spec.ts` | Multi-breakpoint Playwright E2E test verifying expand, collapse, keyboard navigation, and interactions at 768px, 1024px, and 1280px. |

---

## 5. Verification Results

Only genuine tests that were actually executed are reported below:

### 1. TypeScript & Lint
- **Command**: `npm run lint`
- **Output**:
  ```
  > bd-legal-practice@0.0.0 lint
  > tsc --noEmit && tsc --noEmit --project admin-app/tsconfig.json
  ```
- **Result**: **PASS** (0 errors).

### 2. Production Build
- **Command**: `npm run build`
- **Output**:
  ```
  vite v8.3.5 building client environment for production...
  ✓ 1812 modules transformed.
  dist/index.html                     1.44 kB │ gzip:   0.61 kB
  dist/assets/index-DSG4NPOb.css     94.26 kB │ gzip:  15.20 kB
  dist/assets/index-DqskV01q.js   1,422.03 kB │ gzip: 314.35 kB
  ✓ built in 2.05s
  ```
- **Result**: **PASS**.

### 3. I18n Key Parity Test
- **Command**: `npx tsx tests/i18nParity.test.ts`
- **Output**:
  ```
  --- STARTING I18N PARITY & MISSING KEYS SUITE ---
  [PASS] Locale files have 100% key parity between en.json and bn.json
  [PASS] No empty translation strings in en.json and bn.json
  [PASS] All static t(...) keys used in src exist in en.json
  I18n Parity Suite Complete: 3 passed, 0 failed.
  ```
- **Result**: **PASS** (100% key parity).

### 4. Date Key Timezone & Boundary Suite
- **Command**: `npx tsx tests/calendarDateKey.test.ts`
- **Output**:
  ```
  --- STARTING CALENDAR DATE KEY TIMEZONE TEST SUITE ---
  [PASS] formatLocalDateKey produces '2026-11-12' (got 2026-11-12)
  [PASS] getDhakaDateString produces '2026-11-12' (got 2026-11-12)
  [PASS] Found day cell for 12 Nov 2026 in grid
  [PASS] Cell for 12 Nov 2026 has key 2026-11-12 (got 2026-11-12)
  [PASS] Dhaka date for 20:00 UTC (02:00 AM BST) is 2026-11-12 (got 2026-11-12)
  [PASS] TZ=Asia/Dhaka proves old toISOString bug produced 2026-11-11
  [PASS] TZ=Asia/Dhaka proves local cell key for 12 Nov 2026 is 2026-11-12
  [PASS] TZ=UTC proves local cell key for 12 Nov 2026 is 2026-11-12
  ========================================
  CALENDAR DATE KEY TESTS: 8 PASSED, 0 FAILED
  ========================================
  ```
- **Result**: **PASS** (8/8 passed).

### 5. Dashboard & Calendar Integration Tests
- **Command**: `npx tsx tests/dashboard.test.ts`
- **Output**:
  ```
  ========================================
  DASHBOARD TEST RESULTS: 25 PASSED, 0 FAILED
  ========================================
  ```
- **Result**: **PASS** (25/25 passed).

### 6. Responsive No-Horizontal-Overflow Matrix
- **Command**: `npm run test:responsive`
- **Output**:
  ```
  Running 163 tests using 1 worker
  163 passed (5.3m)
  ```
- **Result**: **PASS** (163/163 passed across 320px, 360px, 375px, 768px, 1024px, 1280px, 1440px, and 1920px viewports).

### 7. Playwright E2E Calendar Expand/Collapse Interaction Suite
- **Command**: `npx playwright test e2e/calendarExpandMore.spec.ts`
- **Output**:
  ```
  Running 3 tests using 1 worker
    ok 1 Month grid "+N more" expand/collapse and interactions at 768px (2.9s)
    ok 2 Month grid "+N more" expand/collapse and interactions at 1024px (2.4s)
    ok 3 Month grid "+N more" expand/collapse and interactions at 1280px (2.5s)
    3 passed (12.6s)
  ```
- **Verified Scenarios**:
  - Exactly 3 matters (Day 18): No "+N more" button displayed.
  - Exactly 4 matters (Day 6): `+1 more` button displayed with `aria-expanded="false"`.
  - 12 matters (Day 5): `+9 more` button displayed with `aria-expanded="false"`.
  - Expand / Collapse: Clicking `+1 more` expands all 4 events, reveals "Show less" (`aria-expanded="true"`), and hides "+1 more".
  - Mutual Exclusion: Expanding Day 5 automatically collapses Day 6.
  - Collapse: Clicking "Show less" returns Day 5 to 3 items and restores `+9 more`.
  - Type Filter Reset: Switching filter to "Court Hearings" collapses expanded state.
  - Month Navigation Reset: Clicking "Previous Month" or "Today" collapses expanded state.
  - Keyboard Accessibility: Focus "+1 more" with `Tab`, activate with `Enter`; focus "Show less", collapse with `Space`.
  - Matter Click: Clicking an expanded event navigates to the case dossier tabs.

---

## 6. Local Server Availability

The Vite dev server and backend API server are currently running locally:
- **Local Application URL**: `http://localhost:3000`
- **Calendar Direct URL**: `http://localhost:3000/calendar`
- **Backend API**: `http://localhost:5000/api/v1`

---

## 7. Current Git Status

- **Branch**: `feature/calendar-expand-more`
- **Commit Status**: All files remain uncommitted and unpushed in working tree per instructions, awaiting explicit user approval.
