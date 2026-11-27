# cambio Tarif-Check

Finde heraus, ob deine cambio-Fahrten in einem anderen Tarif günstiger gewesen wären.

**➜ Zur App: [sanieldous.github.io/cambio-tarif-check](https://sanieldous.github.io/cambio-tarif-check/)**

## Was die App macht

- Sie vergleicht, was deine Fahrten tatsächlich gekostet haben, mit dem, was sie in den anderen
  cambio-Tarifen gekostet hätten – Monat für Monat, mit den Preisen, die zum Zeitpunkt der Fahrt
  galten, samt Monatsgebühren und Tarifwechselgebühren.
- Sie nennt den günstigsten einzelnen Tarif für deinen Zeitraum und wie viel du darin gespart
  hättest.
- Sie zeigt im Rückblick den besten Weg mit Tarifwechseln: für jeden Monat den Tarif, bei dem die
  Summe samt Wechselgebühren am kleinsten gewesen wäre.
- Sie zeigt für jede Fahrt, wie verlässlich sie nachgerechnet werden konnte.

Das Ergebnis ist ein Rückblick auf deine bisherigen Fahrten, keine Vorhersage.

## So benutzt du sie

1. Lade deine Fahrten im cambio-Kundenportal unter „Fahrtenarchiv“ als CSV oder Excel herunter.
2. Öffne die [App](https://sanieldous.github.io/cambio-tarif-check/) und zieh die Datei in das
   Ablagefeld oder wähle sie aus. Mehrere Dateien (zum Beispiel ein Export je Jahr) sind kein
   Problem.
3. Lies das Ergebnis: oben die Antwort, darunter die Tabelle mit allen Tarifen je Monat, ein
   Diagramm und die Liste der Fahrten. Die Zahl der weiteren Fahrer:innen, „unter 26“ und den
   Zeitraum kannst du anpassen. Stimmt der Tarif, den die App für einen Monat annimmt, nicht,
   korrigierst du ihn direkt in der Tabelle.

Die Seite „So funktioniert’s“ in der App erklärt, wie gerechnet wird, und zeigt die vollständige
Preistabelle.

## Deine Daten

Alles wird in deinem Browser berechnet. Deine Fahrten werden nie hochgeladen und nie gespeichert;
sobald du die Seite neu lädst oder schließt, sind sie weg. Die Seite lädt nur ihre eigenen Dateien.

## Was du wissen solltest

- Die App ist ein unabhängiges, inoffizielles Werkzeug und steht in keiner Verbindung zu cambio.
  Für die Richtigkeit der Ergebnisse gibt es keine Gewähr.
- Die Preise haben den Stand, der in der App genannt ist, und können veraltet sein. Prüfe vor
  einem Wechsel die aktuellen Preise bei cambio.
- Nicht berücksichtigt sind unter anderem Partnerrabatte, Fahrtguthaben, die Anmeldegebühr, das
  SiPack und pauschale Verspätungsgebühren.
- Wie cambio genau rundet, ist nicht bekannt; ein Unterschied von einem Cent im Zeitbetrag gilt
  deshalb als nachgerechnet.
- Feiertage zählen nur in einigen Regionen wie Wochenenden.

**In English:** cambio Tarif-Check is an independent, unofficial tool for customers of the German
car-sharing provider cambio. Export your trips from the cambio customer portal ("Fahrtenarchiv")
as CSV or Excel, drop the file into the app and see, month by month, what you paid and what every
other tariff would have cost, the cheapest single tariff and the best switching path in hindsight.
Everything is computed in your browser; no trip data leaves your device. The app is available in
German and English: [sanieldous.github.io/cambio-tarif-check](https://sanieldous.github.io/cambio-tarif-check/).

---

## Development

What the app computes, in detail: it recomputes every trip minute by minute (night, weekend and
holiday prices, day and week caps, kilometre tiers, fuel surcharge), reconstructs the booked end
from the billed amount, and compares the tariffs per month including monthly fees and tariff
change fees. It does not consider partner discounts and city offers, the sign-up fee, SiPack,
penalties, business tariffs or trips before the oldest stored price list (`validFrom` in the
price data, currently 2023-06-01). The app only downloads its own static files (and loads further
parts of itself on demand); it sets no cookies and writes nothing to browser storage (no local
storage, session storage or IndexedDB).

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

The build uses a relative base path (`./`) and hash routing (`#/`, `#/how-it-works`), so `dist/`
works from any path: the site root, a GitHub Pages project path or a fork under another name. The
end-to-end tests serve the same build at the root and under a sub-path it was not built for
(`e2e/preview.mjs`).

## Price data

All prices live in `src/domain/pricing/price-data.ts` (data only, amounts in cents including VAT,
with the "prices as of" date). The source is `docs/research/cambio-pricing.md`. Prices that can
change (hour, km and night prices, monthly and additional-driver fees, the switching fee) are kept
in `versions`, each valid from a date; rules that are not prices (night and weekend windows, km
tier, caps, holiday cities) and the fuel surcharge periods are shared. A class may carry its own
day and week cap (`dayCap`, `weekCap`; the lists before 2024-05-02 have flat day and week prices),
and a version may lack a tariff that did not exist yet (START before 2024-05-02). A trip is priced with the
version valid at its return, the fees of a month with the version valid on its first day. To add a
new price list, append a version with its first day and update `pricesAsOf`; to correct the
current one, change it in place. The explanation page and its price table are rendered from this
data, and the tests will tell you what else is affected.

## Fixtures and tools

`tests/fixtures/README.md` describes the anonymised trip exports, the recorded calculator
responses and the invoice line items of the fixture trips (`invoice-items.json`, no personal data)
used by the tests. `tools/anonymize-export.mjs` produces anonymised fixtures from a
personal export and `tools/record-calculator.py` records calculator responses; both are run manually
and locally. Personal source data (portal exports, invoices) belongs in the git-ignored folder
`private/` and must never be committed.

## Releases and deployment

The app is live on GitHub Pages at <https://sanieldous.github.io/cambio-tarif-check/>. Deployment
is fully automatic:

1. A pull request is merged into `main`.
2. The CI workflow (`.github/workflows/ci.yml`) runs lint, type check, unit tests, build and the
   end-to-end tests.
3. When CI succeeds on `main`, the release workflow (`.github/workflows/release.yml`) runs
   semantic-release: Conventional Commits decide whether a new version is due, and if so it is
   tagged and the release notes are published on GitHub (no changelog file is written).
4. The same workflow then builds the app with that version (or, without a new release, the latest
   released version plus the distance to it) and deploys `dist/` to GitHub Pages. The deploy job
   runs only while the repository variable `PAGES_ENABLED` is `true`.

## Documentation

- `docs/design/` – what the app is meant to do and why, including the changes made during implementation.
- `docs/research/cambio-pricing.md` – everything known about the billing rules, with the evidence for each statement.
- `docs/plans/` – the implementation plan the core was built from.

## License

[MIT](LICENSE). The price data and billing rules were collected from public sources and from the
author's own invoices; they come without any guarantee of correctness.
