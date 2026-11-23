# cambio Tarif-Check – design

Status: **draft, awaiting approval**. All question issues (#2–#7) are answered and reflected here.
Items marked _(assumption)_ are unverified readings of cambio's rules, items marked _(my call)_
were decided by the author of this document.

## Intent

cambio customers pay a monthly base fee that buys lower hourly and km prices. Whether the current
tariff is the right one depends on how much one actually drives, and cambio offers no way to check
this in hindsight. This app answers the question from the customer's own trip history:

> Which tariff would have been cheapest for the trips I actually made – and was I in it?

The user downloads the trip export from the cambio customer portal, drops it into the app and
immediately sees the cost per month in the tariff they had and in every other tariff.

## Goals

- Drop one or more exports (CSV or XLSX) and get the result **without any further input** in the
  standard case.
- Show per month: actual cost and the cost in every available tariff, including base fee.
- Name the best single tariff for the whole period and the saving against what was actually paid.
- Show the retrospectively optimal tariff-switching path, including the switching fee.
- Recompute every trip in its actual tariff and show how well the recomputation matches the
  billed amount, so users can trust the numbers.
- Everything runs in the browser. No server, no upload, no persistence.
- German first, English available. Usable by any cambio customer, not only the author.

## Non-goals

- Forecasting future usage or recommending a tariff for trips not yet made.
- Partner discounts and city-specific offers (tracked in #10).
- Business tariffs, sign-up fee, SiPack.
- Filtering by driver. The export must be complete for the statement to hold.
- Exporting the result (first version).
- Recomputing past trips with today's prices. Trips are always priced with the prices valid at
  the time.
- Prices before 2024-05-02 (the portal only exports about one year back).
- Calling cambio's price calculator at runtime.

## Anti-goals

- **A confident wrong number.** If a trip cannot be recomputed, the app says so instead of hiding
  it. A deviation is always visible.
- Anything that looks like an official cambio product. The page states that it is an independent,
  unofficial tool and that prices may be outdated.
- Trip data leaving the browser, or personal data ending up in the repository.

## Constraints

- Static single-page app, hosted on GitHub Pages under the default domain, base path
  `/cambio-tarif-check/`.
- The repository will be made public later. Until then Pages cannot be enabled; the workflows are
  prepared so that enabling Pages is the only remaining step.
- The original exports are never committed. Tests use an anonymised fixture that keeps everything
  needed for the calculation (times, km, vehicle class, tariff, amounts, city, status) and replaces
  name, licence plate, station, booking object, comments and invoice numbers.
- Code, comments and docs in English; issues and PR descriptions in German.
- Work happens on branches with complete PR descriptions; PRs are merged once checks are green.

## Approaches

Three ways to obtain "what would this trip have cost in tariff X" were considered:

1. **Re-implement the price calculation locally, verify it against recorded calculator responses
   and against billed amounts.** Works offline, handles past dates and early returns. Needs a
   maintained price table. **Chosen.**
2. **Call cambio's price calculator.** Not possible from a browser (signed form fields, no CORS),
   cannot price past dates and knows no early return.
3. **Scale the billed amounts by the ratio of hourly/km prices.** Simple, but wrong whenever night
   hours, weekend prices (Basis/Campus), day/week caps or the 100 km tier are involved.

For the import, a ready-made import wizard library was considered and rejected: it forces wizard
steps even in the standard case and brings a second UI framework. The app uses its own
auto-detecting import with a mapping dialog as fallback.

## How it works

### 1. Import

- Accepts `.csv` and `.xlsx` via drag-and-drop or file picker, several files at once.
- CSV: delimiter and encoding are detected (`;`, UTF-8 with BOM in today's export). Numbers with
  decimal comma, dates as `DD.MM.YYYY HH:MM:SS`; XLSX cells may arrive as real dates/numbers.
- **Column detection:** each required field has a list of known header names; headers are
  normalised (case, whitespace, diacritics) and matched exactly first, then by similarity. If all
  required fields are found unambiguously, the import proceeds without any dialog.
- **Mapping dialog (fallback):** shown only if a required field is missing or ambiguous. One select
  per field listing the file's columns, with a preview of the first rows. Detected fields are
  pre-filled.
- Required fields: city, vehicle class, booking start, booking end, km, time amount, km amount,
  tariff. Optional: driver, trip start/end, total amount, status, invoice date.
- Times in the export are local wall-clock times without offset. They are handled as naive local
  times, independent of the browser's time zone; daylight-saving shifts are ignored (a booking
  across the change is off by one hour, which is accepted).
- Rows are validated one by one. Invalid rows are listed with the reason and excluded; valid rows
  are still evaluated.
- Rows without amounts (not yet billed) are listed separately as "not yet billed" and excluded;
  their month is marked incomplete in the result.
- Duplicate trips across files (same start, end, vehicle class, km, amounts) are counted once.
- The app shows the detected period and trip count, warns about months without any trip, and
  states clearly that the export must be complete (all drivers, no gaps).

### 2. Price data

A versioned data file in the repository, taken from `docs/research/cambio-pricing.md`:

- Tariffs with monthly fee, additional-driver fee and availability (Start only in some cities,
  Campus only under 26).
- Per tariff and price class: weekday hour, weekend hour, km tier 1, km tier 2. Day price
  (12 × weekday hour) and week price (6 × day price) are derived.
- Rule constants: night 00:00–06:00 at 0.50/h, weekend Friday 12:00 – Monday 06:00, km tier
  boundary 100, switching fee 5.00.
- Fuel surcharge per km as a list of validity periods. The list has known gaps. If the billed km
  amount of a trip is explained exactly by a different surcharge (whole cents, same for both km
  tiers), that surcharge is used for the trip in all tariffs and the result page reports that the
  table is out of date.
- Monthly fees, additional-driver fee and switching fee are identical in the price lists of
  2024-05, 2025-03 and 2026 (checked), so one value each is enough for now.
- Nationwide public holidays are computed (New Year, Good Friday, Easter Monday, 1 May, Ascension
  Day, Whit Monday, 3 October, 25 and 26 December). Only four of them are confirmed by the
  calculator so far; the rest and the exact hours are settled with calculator fixtures.
- Start has prices for XS and XL only in the PDF price list; those are used.
- A "prices as of" date. Each price entry has a validity period so later price changes can be
  added without touching code.

Trips before 2024-05-02 have no verified prices: they are excluded with a notice. Trips newer than
the "prices as of" date are evaluated with the latest known prices and a warning.

### 2a. Keeping prices current

Prices will go out of date. Three mechanisms deal with that:

- **Editable prices in the app.** A "Prices" page reachable from the menu shows the complete price
  data in use (monthly fees, hourly and km prices per tariff and class, fuel surcharge periods,
  switching fee) and lets the user change any value or add a surcharge period. The result is
  recomputed immediately; changed values are marked and can be reset individually or all at once.
  Overrides are kept in the browser's local storage so they survive a reload – they are not
  personal data; trips are still never stored _(my call)_.
- **"Report a price change".** A link on the same page opens a prefilled GitHub issue form asking
  for tariff, class, old and new value, effective date and source link.
- **Weekly automated check.** A scheduled GitHub Action fetches cambio's tariff page for a few
  cities that together cover all classes and tariffs, extracts the price table and the dated
  surcharge note, and compares them with the data file. On a difference it opens a pull request
  that updates the data file and links the source page, to be verified and merged by a human. If
  the page can no longer be parsed, it opens an issue instead of failing silently.

### 3. Price calculation

A pure function: `(booking start, charged-until, booked end, km, price class, tariff, date) →
{ time cost, km cost }`.

- **Price class** is the first token of the vehicle class column (`S Kleinwagen` → S).
- **Time:** per minute pro rata to the hourly price of that minute (night, else weekend/holiday for
  Basis and Campus, else weekday). Each 24-hour block from booking start is capped at the day
  price, each 7-day block at the week price.
- **Km:** first 100 km at tier 1, the rest at tier 2, each plus the fuel surcharge valid for the
  trip. Prices used are those valid at the end of the trip. The surcharge can be passed in
  explicitly (needed for calculator fixtures, which carry the surcharge of the recording day).
- **Early return:** the return time is rounded up to the next quarter hour (a return exactly on a
  quarter hour is not rounded). With `cost(a, b)` being the capped time cost of a booking from
  `a` to `b`:
  `time cost = cost(start, rounded return) + 50 % × (cost(start, booked end) − cost(start, rounded return))`.
  Caps therefore apply to the booking as a whole; unused time after a cap has been reached is
  free. This interaction with caps and night hours is unverified _(assumption)_.
- **Rounding:** the full-price part and the 50 % part of the time cost are each rounded half-up to
  cents and then added. Of the 85 real trips, 3 are special cases (two 0 km rows, one unexplained);
  of the other 82, about 75 match exactly and the rest differ by exactly one cent. cambio's
  calculator seems to round differently again (its samples fit "round the net amount, then add
  VAT"). The exact rule is open and isolated in one function so it can be replaced once an invoice
  clarifies it. Until then **one cent of deviation in a time amount counts as matching**.

### 4. Reconstructing the booking

The export's "Buchungsende" is the actual return time; the booked end is missing. For each trip
the app searches the quarter-hour grid for the booked end whose cost in the **actual tariff**
matches the billed time amount:

- Exact match → trip is "verified". Several matches → the shortest booking is taken and the trip
  is marked "estimated".
- For estimated and not reproducible trips the user can enter the booked end by hand in the trip
  list; the trip is then computed with that value in all tariffs.
- Match within 1 cent → "verified (rounding)".
- No match → the trip is "not reproducible": it is still included, using the booking as exported
  (no unused time), and flagged. Its deviation is shown.
- **0 km rows:** the billed time amount is compared with the full price of the exported booking
  period. 50 % → booking cancelled less than 24 h before start; 100 % → booking neither cancelled
  nor used (both confirmed by the product owner for the two rows in the sample). The same share is
  applied in every other tariff. Any other share is treated like a normal trip.
- Penalties (late return and similar) are not modelled. A trip containing one ends up as "not
  reproducible".
- The km amount is checked the same way. A mismatch that the surcharge rule above cannot explain
  also makes the trip "not reproducible".

Other tariffs are then computed with the **same booking behaviour** (same booked end, same early
return). The tariff is the only thing that changes.

### 5. Monthly comparison

- A trip belongs to the **month of its actual return** (the export's booking end), because cambio
  bills a trip that spans a tariff switch entirely in the new tariff.
- The period runs from the month of the first trip to the month of the last trip. The period
  filter selects a range of whole months; all figures are recomputed for the selection.
- Cost of a month in tariff T = sum of its trips in T (model) + monthly fee of T +
  additional-driver fees of T.
- **Actual cost** of a month = billed time and km amounts from the export (not the total column,
  which could contain other items) + monthly fee and additional-driver fees of the actual tariff
  + 5.00 whenever the tariff differs from the previous month.
- The actual tariff of a month is the one in the tariff column; months without trips inherit the
  previous month's tariff. If a month contains two tariffs, the one of the last trip counts and
  the month is flagged.
- The row of the user's own tariff shows the model like every other row. The difference between
  model and billed amounts is shown as "recomputation deviation", so it cannot pass as a saving.
- **Best single tariff:** lowest total over the period, as if the user had been in it from the
  start (no switching fee).
- **Optimal switching path:** exact minimum over all month-by-month tariff sequences with 5.00 per
  switch (dynamic programming); the first month is free to choose. Labelled as "in hindsight",
  because nobody knows the coming month in advance.
- **Break-even:** tariffs shown are ordered by monthly fee. For each neighbouring pair (cheaper
  fee A, higher fee B) the app computes from the user's own trips how much cheaper B prices them
  (`s = 1 − trips in B / trips in A`) and derives the monthly trip cost in A from which B pays
  off: `(fee B − fee A) / s`. Shown as "from about X € of trips per month" with the user's months
  marked. Pairs with equal fees are skipped.

Which tariffs are compared:

- Basis, Aktiv and Comfort always, regardless of city.
- Start if at least one trip is in a city that offers it.
- Campus only if "I am under 26" is on. It is switched on automatically if the export contains
  Campus trips, and unavailable while additional drivers > 0 (Campus allows none).
- Additional drivers: default 0. If the export contains several distinct drivers, the field is
  pre-filled with that number minus one and a visible hint says so.

### 6. Result page

Desktop first, usable on a phone, light and dark mode. Sketch:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Dein bester Tarif 2025: AKTIV                                                │
│ 1.870 € statt 1.950 € tatsächlich  →  80 € gespart                           │
│ Rückblickend optimal mit Wechseln: 1.840 € (4 Wechsel)                       │
│ 84 von 85 Fahrten auf den Cent nachgerechnet                 [Zeitraum ▾]    │
├──────────────────────────────────────────────────────────────────────────────┤
│            Jan    Feb    Mär    Apr    Mai    Jun   …   Summe                │
│ Basis      612    131     98     62     95     71       2.210                │
│ Aktiv      540   [112]   ▣86    ▣55    ▣83    ▣64       1.870   ← best       │
│ Comfort   ▣498   ▣118     93     66     91     75       1.905                │
│            ▣ = dein Tarif   [ ] = günstigster   ── optimaler Pfad            │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Diagramm: Monatskosten je Tarif]      [Ab wann lohnt sich welcher Tarif]    │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▸ März 2025 – 7 Fahrten (aufklappbar: je Fahrt Zeit/km je Tarif, Status)     │
└──────────────────────────────────────────────────────────────────────────────┘
```

(Numbers are placeholders.)

- Settings next to the result: number of additional drivers, "I am under 26" (shows Campus),
  period filter. A link leads to the price page.
- Notices: unofficial tool, prices as of date, data stays in the browser, export must be complete.
- Further routes: the price page (see 2a) and a page explaining how the calculation works.

## Technology

Single package, pnpm, Node ≥ 22.

- React 19, Vite, TypeScript strict
- TanStack Router with hash history (extra routes for analyses later)
- Jotai for state (imported trips, settings, derived results)
- Tailwind CSS v4 and shadcn/ui components, lucide icons, Recharts
- i18next with JSON files per locale (`de` default, `en`)
- Papa Parse for CSV and a small XLSX reader from the npm registry (read-excel-file), the latter
  loaded on demand
- Vitest and Testing Library; Playwright for an end-to-end smoke test
- ESLint (flat config, type-aware) and Prettier; Conventional Commits

Structure: the domain logic (`pricing`, `import`, `analysis`) is plain TypeScript without React and
holds most of the tests; `features/` contains the UI per area; `routes/` the pages.

## Verification

- **Calculator fixtures:** about 200 recorded responses of cambio's price calculator for future
  dates (classes, durations, night, weekend, holidays, day/week caps, km tiers) are stored in the
  repository (recorded once, spread over more than ten minutes), each with its recording date and the
  surcharge valid then. Km costs must match exactly, time costs within one cent (exactly, if the
  calculator's rounding rule can be pinned down). Tests run offline.
- **Real trips:** the anonymised fixture is produced once from the owner's exports. Every trip is
  recomputed in its actual tariff. Km amounts must match exactly; time amounts within one cent.
  The only listed exception is the one trip billed above the full price of its booking.
- **Import:** tests for CSV and XLSX, renamed/reordered/missing columns, duplicates, invalid rows.
- **Analysis:** tests for month assignment, actual-cost derivation and the switching optimum.
- **End-to-end:** upload the fixture, see the result.

## Delivery

- PR checks: lint, type check, unit tests, build, end-to-end smoke test.
- On merge to `main`: semantic-release derives the version from the commits and creates tag and
  GitHub release; the same workflow builds and deploys to Pages. The version is shown in the
  footer. The deploy job only runs when a repository variable switches it on, so the workflow
  stays green while Pages is not yet available.

## Order of delivery

1. Core: import, price data, calculation, booking reconstruction, monthly comparison, result page,
   i18n, CI and deployment workflow.
2. Editable prices and "report a price change".
3. Weekly automated price check.

Each step is usable on its own and delivered through its own pull requests.

## Left to the builder

- Exact visual design, within "appealing, numbers first".
- Similarity threshold and alias lists for column detection.
- Internal module boundaries and naming.
- Selection of the calculator fixture cases.

## Open points

- Exact rounding rule of the billed time amount (an invoice PDF would settle it).
- One trip whose time amount exceeds the full price of its booking.
- How the 50 % charge interacts with day/week caps and night hours.
