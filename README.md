# cambio Tarif-Check

A small static web app for car-sharing customers: drop your trip export (CSV or XLSX) and see what
each tariff would have cost for your actual trips. Everything runs in the browser. Your trip data
is never uploaded and never stored.

This is an unofficial tool and is not affiliated with cambio. The prices it uses may be out of
date; always check the official tariff information before switching.

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

## Releases and deployment

Pushes to `main` run semantic-release (Conventional Commits) and, once enabled, deploy to GitHub
Pages. To go live:

1. In the repository settings, enable GitHub Pages with the source "GitHub Actions".
2. Set the repository variable `PAGES_ENABLED` to `true`.
