# cambio Tarif-Check

A small static web app for car-sharing customers: drop your trip export (CSV or XLSX) from the
cambio customer portal ("Fahrtenarchiv") and see, month by month, what you paid and what every other
tariff would have cost for the same trips, using the prices that were valid at the time.

## What it does and does not do

- It recomputes every trip minute by minute (night, weekend and holiday prices, day and week caps,
  kilometre tiers, fuel surcharge), reconstructs the booked end from the billed amount, and compares
  the tariffs per month including monthly fees and tariff change fees. The page "So funktioniert's"
  / "How it works" explains the details and shows the complete price table.
- It does not consider partner discounts and city offers, the sign-up fee, SiPack, penalties,
  business tariffs or trips before 2024-05-02. Public holidays follow a fixed list. The price data
  can be out of date.
- It is an unofficial tool and is not affiliated with cambio. There is no guarantee that the
  results are correct.

## Privacy

Everything is calculated in the browser. Trip data is never uploaded and never stored. The app only
downloads its own static files (and loads further parts of itself on demand); it sets no cookies and
writes nothing to browser storage (no local storage, session storage or IndexedDB). Reloading the
page discards the imported trips.

## Development

Requirements: Node.js 22 or newer and pnpm.

```sh
pnpm install
pnpm dev          # start the dev server
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test         # unit tests (Vitest)
pnpm build        # type check and production build into dist/
pnpm test:e2e     # Playwright smoke test against the production build (vite preview)
pnpm format       # Prettier
```

Before the first end-to-end run, install the browser once:

```sh
pnpm exec playwright install chromium
```

The app is served under the base path `/cambio-tarif-check/` and uses hash routing
(`/#/`, `/#/how-it-works`).

## Price data

All prices live in `src/domain/pricing/price-data.ts` (data only, amounts in cents including VAT,
with the "prices as of" date). The source is `docs/research/cambio-pricing.md`. To update: change
the tariffs, fuel surcharge periods and `pricesAsOf` there; the explanation page and its price table
are rendered from this data, and the tests will tell you what else is affected.

## Fixtures and tools

`tests/fixtures/README.md` describes the anonymised trip exports and the recorded calculator
responses used by the tests. `tools/anonymize-export.mjs` produces anonymised fixtures from a
personal export and `tools/record-calculator.py` records calculator responses; both are run manually
and locally. Personal exports (`Fahrten_*.csv`, `Fahrten_*.xlsx`) are git-ignored and must never be
committed.

## Releases and deployment

Releases are made by semantic-release from Conventional Commits: pushes to `main` create the
version and the release notes on GitHub (no changelog file is written) and, once enabled, deploy
to GitHub Pages. To go live:

1. In the repository settings, enable GitHub Pages with the source "GitHub Actions".
2. Set the repository variable `PAGES_ENABLED` to `true`.
