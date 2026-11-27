# Test fixtures

All files here are safe to commit. None of them contains personal data.

| File                       | Origin                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `trips-2025.csv`           | Anonymised portal CSV export covering 2024-12-31 to 2025-12-31 (84 trips).                                          |
| `trips-2026.csv`           | Anonymised portal CSV export covering 2025-12-31 to 2026-11-23 (1 trip).                                            |
| `trips-all.csv`            | Anonymised portal CSV export of all trips, 2022-01-01 to 2026-11-28 (154 trips, 2023-10-03 to 2026-05-12).          |
| `trips-2025.xlsx`          | Anonymised counterpart of the portal's XLSX export for the same period as `trips-2025.csv`, with cell types intact. |
| `calculator-fixtures.json` | Recorded responses of the public price calculator (197 requests), used to verify the price calculation.             |
| `invoice-items.json`       | The invoice line items of 108 of the 154 trips of `trips-all.csv`, used to verify the reconstruction.               |

## Trip exports

CSV format: delimiter `;`, UTF-8 with BOM, CRLF line endings, decimal comma, 28 columns in the
original order. `.gitattributes` marks `tests/fixtures/*.csv` as `-text` so Git stores them
byte-exact (no line-ending conversion).

Kept unchanged: `Datum`, `Stadt`, `Wagenklasse`, the booking and trip times, `Kilometer`, the CO2
columns, `Kraftstoffart`, all amount columns, `Währung`, `Mehrwertsteuer`, `Tarif`,
`Rechnungsdatum`, `Verarbeitungsstatus`.

Replaced by stable pseudonyms, numbered in order of first appearance per file:

- `fahrende Person` -> `Person A`, `Person B`, ...
- `Buchungsobjekt` -> `Fahrzeug 1`, `Fahrzeug 2`, ...
- `Kennzeichen` -> `XX XX 1`, `XX XX 2`, ...
- `Station` -> `Station 1`, `Station 2`, ...
- `Rechnungnummer` -> `1001`, `1002`, ... (1000 + 1-based index of the distinct value)

Emptied: `Kommentar`, `KommentarKundenService`, `Abteilung`, `Kostenstelle`.

### Regenerate

The personal originals (`Fahrten_*.csv`, `Fahrten_*.xlsx`) live in `private/exports/`. The whole
`private/` folder is git-ignored. With them present:

```sh
node tools/anonymize-export.mjs private/exports/Fahrten_2024-12-31_2025-12-31.csv tests/fixtures/trips-2025.csv
node tools/anonymize-export.mjs private/exports/Fahrten_2025-12-31_2026-11-23.csv tests/fixtures/trips-2026.csv
node tools/anonymize-export.mjs private/exports/Fahrten_2024-12-31_2025-12-31.xlsx tests/fixtures/trips-2025.xlsx
node tools/anonymize-export.mjs private/exports/Fahrten_2022-01-01_2026-11-28.csv tests/fixtures/trips-all.csv
```

`trips-all.csv` contains the trips of `trips-2025.csv` and `trips-2026.csv` again (with pseudonyms
numbered in its own order). The two smaller files are kept because tests pin figures computed from
them.

The tool is deterministic: the same input always produces the same bytes. When the originals are
present, `fixtures.test.ts` also checks that no value of the replaced columns survives in a fixture.

## XLSX structure and cell types

The portal's workbook has one sheet named `Fahrten` (no shared strings; the header row is row 1).
Cell types per column, as found in the original and kept in the fixture:

| Column(s)                                                   | Cell type                                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Datum`                                                     | text (`DD.MM.YYYY`), not a date cell                                                     |
| `Buchungsbeginn`, `Buchungsende`                            | real date-time cells: numeric serial with number format 22 (`m/d/yy h:mm`)               |
| `Fahrtbeginn`, `Fahrtende`                                  | the same date-time cells, but only for 7 of the 84 rows; otherwise an empty numeric cell |
| `Rechnungsdatum`                                            | real date cell: numeric serial with number format 14 (`m/d/yyyy`)                        |
| `Kilometer`, `CO² Emission …`, `Betrag …`, `Mehrwertsteuer` | numbers (amounts are numeric, e.g. `4.98`, not text with decimal comma)                  |
| `Rechnungnummer`                                            | text                                                                                     |
| all other columns                                           | text; empty values are empty text cells (`t="str"` without value)                        |

Note: the CSV and XLSX exports of the same period differ in content (for example
`Fahrtbeginn`/`Fahrtende` is filled for far fewer rows in the XLSX).

The anonymiser edits the worksheet XML in place with `fflate` (a dev dependency; `read-excel-file`
is read-only), touching only text cells of the replaced columns. All other XML parts and all other
cells stay byte-identical, so every cell type is preserved exactly. The only cells whose content
changes type of value are emptied comment cells, which become empty text cells (the same
representation the original uses for empty values). The ZIP container is rewritten with a fixed
timestamp so the output is deterministic.

## Invoice items

`invoice-items.json` holds, for 108 of the 154 trips of `trips-all.csv` (all 85 trips of
`trips-2025.csv` and `trips-2026.csv`, and 23 trips from 2023-10-03 to 2024-12-30), the time and km
line items exactly as invoiced. It contains no personal data: no names, vehicles, stations or invoice numbers, only the
booking start (to match a trip by the export's `Buchungsbeginn`), tariff, class, items and km.
It is an array of `{ bookingStart, tariff, priceClass, timeItems, km, kmGross }`, where
`bookingStart` and the items' `start` and `end` are `DD.MM.YYYY HH:mm` and amounts are integer
cents including VAT. `timeItems` is a list of `{ kind, start, end, gross }`:

- `full` ("Normalfahrt Zeit"): from the booking start to the return rounded up to the quarter hour
  (or to the booked end when returned late), at the full time price.
- `cancelled` ("kurzfristig stornierte Zeit"): from there to the booked end, at 50 %. A booking
  cancelled shortly before its start has only this item, over the whole booking.
- `overrun` ("Überziehung"): from the booked end to the actual return minute, at double the price.
- `late` ("Verspätung"): from the booked end to the next quarter hour, at the regular price (a
  return a few minutes late).

`src/domain/analysis/invoice-items.test.ts` compares them with the reconstruction from the export.

## Calculator fixtures

`calculator-fixtures.json` is an array of
`{ group, city, vehicleClass, priceClass, start, end, km, recordedAt, surchargeCents, costs }`,
where `start` and `end` are `DD.MM.YYYY HH:mm`, amounts in `costs` are euros as recorded
(`{ [tariff]: { time, km, total } }`, `km` is `0` when the request had 0 km) and
`surchargeCents` is `3`.

- **Recorded on 2026-11-23** from the public price calculator, via `tools/record-calculator.py`.
- **The km prices include a surcharge of 3 ct per km** (`surchargeCents: 3`), which the calculator
  adds on top of the tariff's km price.
- The requests use dates in 2027 and 2028 because the calculator only prices future dates.
- The last 31 entries (group `short-remainder`, recorded later the same day) probe a remainder of
  less than an hour after full days. From 7 days on the calculator charges such a remainder, while
  an invoice did not; `calculator-fixtures.test.ts` therefore skips those 7 entries.

To record again (manually and sparingly; one request pair every 6 seconds, resumable):

```sh
python tools/record-calculator.py recorded.jsonl
```

The resulting JSON lines are converted to the array format above by flattening `request` into the
object and adding `surchargeCents: 3`.
