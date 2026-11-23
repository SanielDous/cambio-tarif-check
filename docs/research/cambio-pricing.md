# cambio pricing research

Research date: 2026-11-23. Source: public pages and price list PDFs of
<https://www.cambio-carsharing.de/>, archived versions of those pages (Wayback Machine), about
70 live calls to the price calculator on the tariff page, and one real trip export (84 trips,
Aachen, 2024-12-31 to 2025-12-31).

Every statement is marked by how it is known:

- **documented** – stated on a cambio page or in a price list PDF
- **calculator** – observed in price calculator responses, not written down anywhere by cambio
- **export** – derived from billed amounts in the trip export
- **inferred** / **open** – a hypothesis or an unanswered question

All prices are EUR including VAT.

## Summary

- Prices are **identical in all cities** per tariff and price class. Cities differ only in which
  price classes and tariffs they offer.
- Time prices and base km prices have been **unchanged since 2024-05-02**.
- The km price carries a **fuel surcharge that changes over time**; it is the same in all tariffs.
- The trip export does **not contain the originally booked end**. It can be reconstructed from the
  billed time amount.
- The price calculator is not a JSON API, cannot price past dates and knows nothing about early
  returns. It is only usable to record test data for a local implementation.

## Tariffs (private customers)

Source: <https://www.cambio-carsharing.de/tarife>, `Tarife_Privat_26.pdf`. (documented)

| Tariff  | Sign-up fee | Monthly fee | Additional driver: sign-up / monthly | Notes                                              |
| ------- | ----------- | ----------- | ------------------------------------ | -------------------------------------------------- |
| CAMPUS  | 30.00       | 0.00        | not possible                         | Under 26 only; switches to BASIS automatically     |
| BASIS   | 30.00       | 0.00        | 30.00 / 0.00                         |                                                    |
| START   | 30.00       | 3.50        | 30.00 / 3.00                         | Only Berlin, Bielefeld, Hamburg, Dortmund          |
| AKTIV   | 30.00       | 11.00       | 30.00 / 3.00                         |                                                    |
| COMFORT | 30.00       | 27.00       | 30.00 / 3.00                         |                                                    |

- No deposit is mentioned.
- SiPack (optional deductible reduction): 60.00 per year and driver.
- The calculator backend also returns `Z-START` and `PROFI` (business); the page hides them.
- Partner discounts exist per city (for Aachen see <https://www.cambio-carsharing.de/aachen/angebote>);
  their details were not researched.

## Price table

Time prices valid from 2024-05-02 until at least the research date. (documented)

- Night hour (00:00–06:00): **0.50 in every tariff and class**.
- Day price = 12 × weekday hour price. Week price = 6 × day price.
- Fuel and electricity are included. Booking via app or web is free, by phone 1.00 per booking.
- Weekend prices exist only in CAMPUS and BASIS and apply Friday 12:00 to Monday 06:00.
- Km prices below are **base prices without fuel surcharge**; tier 2 applies from km 101.

| Tariff  | Class | Hour weekday | Hour weekend | Day (24 h) | Week   | Km 1–100 | Km from 101 |
| ------- | ----- | ------------ | ------------ | ---------- | ------ | -------- | ----------- |
| CAMPUS  | XS    | 2.40         | 2.95         | 28.80      | 172.80 | 0.26     | 0.20        |
| CAMPUS  | S     | 2.75         | 3.15         | 33.00      | 198.00 | 0.26     | 0.20        |
| CAMPUS  | M     | 3.85         | 4.15         | 46.20      | 277.20 | 0.27     | 0.20        |
| CAMPUS  | L     | 7.05         | 7.55         | 84.60      | 507.60 | 0.37     | 0.19        |
| CAMPUS  | XL    | 8.46         | 9.82         | 101.52     | 609.12 | 0.40     | 0.20        |
| BASIS   | XS    | 2.50         | 3.25         | 30.00      | 180.00 | 0.28     | 0.21        |
| BASIS   | S     | 3.30         | 4.15         | 39.60      | 237.60 | 0.28     | 0.21        |
| BASIS   | M     | 4.30         | 5.20         | 51.60      | 309.60 | 0.29     | 0.21        |
| BASIS   | L     | 7.15         | 8.20         | 85.80      | 514.80 | 0.39     | 0.23        |
| BASIS   | XL    | 8.58         | 10.66        | 102.96     | 617.76 | 0.42     | 0.24        |
| AKTIV   | XS    | 1.65         | –            | 19.80      | 118.80 | 0.24     | 0.19        |
| AKTIV   | S     | 2.10         | –            | 25.20      | 151.20 | 0.25     | 0.19        |
| AKTIV   | M     | 2.60         | –            | 31.20      | 187.20 | 0.26     | 0.19        |
| AKTIV   | L     | 5.10         | –            | 61.20      | 367.20 | 0.36     | 0.22        |
| AKTIV   | XL    | 6.12         | –            | 73.44      | 440.64 | 0.39     | 0.23        |
| COMFORT | XS    | 1.50         | –            | 18.00      | 108.00 | 0.21     | 0.16        |
| COMFORT | S     | 1.85         | –            | 22.20      | 133.20 | 0.22     | 0.16        |
| COMFORT | M     | 2.35         | –            | 28.20      | 169.20 | 0.23     | 0.16        |
| COMFORT | L     | 4.15         | –            | 49.80      | 298.80 | 0.31     | 0.20        |
| COMFORT | XL    | 4.98         | –            | 59.76      | 358.56 | 0.34     | 0.21        |
| START   | S     | 2.35         | –            | 28.20      | 169.20 | 0.33     | 0.22        |
| START   | M     | 3.45         | –            | 41.40      | 248.40 | 0.37     | 0.22        |
| START   | L     | 5.65         | –            | 67.80      | 406.80 | 0.42     | 0.26        |

Notes:

- The base km prices were obtained as "website value minus the surcharge valid at research time
  (3 ct)". The PDF text extraction is jumbled, but every legible value matches.
- The AKTIV and COMFORT km prices for S, M, L and XL are confirmed by the export (84 of 84 km
  amounts exact with base + 1 ct).
- START XS (1.85 / 22.20 / 133.20; 0.29 / 0.22) and START XL (6.78 / 81.36 / 488.16; 0.45 / 0.27)
  appear only in the PDF; no city's web table shows them.
- Class XL first appears in the price list dated 2025-03-01.

### Fuel surcharge on the km price

Effective km price = base price + surcharge, applied to **both** km tiers and identical in all
tariffs. (documented; timeline reconstructed from the dated note on the tariff page in archived
snapshots)

| From       | Surcharge per km | Notes                                   |
| ---------- | ---------------- | --------------------------------------- |
| 2024-07-01 | +0.01            | Confirmed by snapshots throughout 2025  |
| 2026-01-15 | +0.01            | New price list                          |
| 2026-03-07 | +0.03            |                                         |
| 2026-04-23 | +0.03            |                                         |
| 2026-09-17 | +0.05            |                                         |
| 2026-10-01 | +0.04            |                                         |
| 2026-11-06 | +0.03            | Current at research date                |

- 2025-12-12 to 2026-01-14 has no snapshot; +0.01 is inferred because both neighbours say +0.01.
- Changes during 2026 that fell between two snapshots may be missing.
- Rule printed in the price list: the base price holds for a petrol (E5) price of 1.55–1.69 EUR/l;
  +1 ct from 1.70, +2 ct from 1.85, +3 ct from 2.00, +4 ct from 2.15, based on a 14-day average.

## Cities

There is no city in any URL. The city is a cookie `selectedCity=<uid>`; the server renders the
tariff and download pages from it. All 48 cities were parsed: **no price differs anywhere**.

| Cities                                                                                                      | Classes         | Tariffs                        |
| ----------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------ |
| Aachen                                                                                                      | S, M, L, XL     | Campus, Basis, Aktiv, Comfort  |
| Köln, Bonn, Bremen, Oldenburg, Wuppertal                                                                    | XS, S, M, L, XL | same four                      |
| Bremerhaven, Düsseldorf                                                                                     | XS, S, M, L     | same four                      |
| Flensburg, Hürth, Lilienthal, Saarbrücken                                                                   | S, M, L         | same four                      |
| Lüneburg                                                                                                    | S, M, XL        | same four                      |
| Aurich, Brühl, Delmenhorst, Düren, Herzogenrath, Leer, Pulheim, Sankt Augustin, Siegburg, Wilhelmshaven, Würselen | S, M      | same four                      |
| 19 small towns (Achim, Eschweiler, Jülich, Frechen, …)                                                      | S               | same four                      |
| Worpswede                                                                                                   | L               | same four                      |
| Berlin, Bielefeld, Hamburg                                                                                  | S, M, L         | the four plus Start            |
| Dortmund                                                                                                    | S, M            | Start, Aktiv, Comfort          |

City uids: Aachen 1, Achim 2, Berlin 3, Bielefeld 4, Bonn 5, Bremen 6, Bremerhaven 7, Brühl 8,
Dormagen 9, Düren 10, Düsseldorf 11, Erftstadt 12, Eschweiler 13, Flensburg 14, Frechen 15,
Hamburg 16, Herzogenrath 17, Hürth 18, Jülich 19, Köln 21, Leer 22, Lilienthal 23, Lüneburg 24,
Oldenburg 25, Saarbrücken 26, Sankt Augustin 27, Siegburg 28, Uelzen 29, Verden 30,
Wilhelmshaven 31, Winsen 32, Wuppertal 33, Würselen 34, Dortmund 37, Euskirchen 41, Pulheim 44,
Delmenhorst 50, Worpswede 51, Troisdorf 52, Bad Zwischenahn 53, Emden 54, Kerpen 55, Stuhr 57,
Weyhe 58, Ganderkesee 59, Wildeshausen 60, Aurich 61, Bergheim 62.

Vehicle class options of the calculator are `<mandant>-<id>` (Aachen `15-…`, Köln `12-…`,
Hamburg `31-…`). Aachen options and their price class (verified by calling each):

| Option value | Label              | Price class |
| ------------ | ------------------ | ----------- |
| 15-393       | S Kleinwagen       | S           |
| 15-493       | S E-Kleinwagen     | S           |
| 15-527       | S Smart ED Pool AC | S           |
| 15-455       | M Kombi            | M           |
| 15-514       | M Hochdachkombi    | M           |
| 15-631       | M E-Transporter M  | M           |
| 15-53        | L 9-Sitzer         | L           |
| 15-54        | L Transporter L    | L           |
| 15-672       | XL Transporter XL  | XL          |

The label always starts with the price class, which matches the `Wagenklasse` column of the export.

## Tariff change

Sources: tariff page, FAQ "Tarifwechsel", terms and conditions. (documented)

- Possible only to the 1st of a month, done in the customer portal, **5.00 per change**.
- A trip that spans the switch date is billed **entirely in the new tariff**.
- No notice period or minimum term for a tariff change is stated.
- Contract termination: two weeks' notice to the end of a month.

## Billing rules

### Documented

- Bookings start and end on quarter hours; minimum 1 hour, maximum 30 days.
- The price list valid at the time of return applies.
- **Early return:** the booking ends automatically; the unused time between actual and booked end
  is charged at 50 % of the time price.
- **Cancel or shorten (2025 price list):** free more than 24 h before start, otherwise 50 % of the
  time price. From 2026-01-15: unchanged for bookings up to 7 days; longer bookings are free up to
  7 days before start, then 50 %.
- **Late return:** 15.00 per affected following booking plus the regular time price. Extending
  after the booking end, or not at all: 40.00 plus double time price.
- No long-trip discount beyond day/week caps and the cheaper km tier.

### Observed in the calculator

(Aachen, class S, future dates in December 2026 and 2027)

- **Time cost is pro rata per minute**, the total rounded to cents. AKTIV: 15 min = 0.52,
  45 min = 1.57, 75 min = 2.63. The calculator does not enforce the 1-hour minimum.
- **Night overrides everything:** AKTIV 22:00–08:00 = 4 × 2.10 + 6 × 0.50 = 11.40. Saturday
  00:00–01:00 = 0.50 in every tariff.
- **Day cap:** each 24-hour block counted **from booking start** costs at most the day price; the
  remainder is priced hourly and capped again. AKTIV: 06:00–18:00 = 25.20, 06:00–19:00 = 25.20,
  26 h = 29.40, 34 h = 46.20, 37 h = 50.40.
- Blocks are anchored at the start: BASIS Friday 06:00 to Saturday 12:00 = 64.50
  (39.60 + 6 × 4.15); an end-anchored split would give 59.40.
- The BASIS/CAMPUS day cap is the **weekday** day price even on weekends: BASIS Saturday
  06:00–16:00 = 39.60.
- **Week cap:** each 7-day block costs at most the week price. AKTIV: 6 days = 7 days = 151.20,
  8 days = 176.40, 14 days = 302.40, 5 d 10 h = 147.00.
- **Km tiers are marginal:** AKTIV (with +3 ct): 100 km = 28.00, 101 km = 28.22, 250 km = 61.00.
- **Nationwide public holidays use the weekend price** in CAMPUS/BASIS: 2026-12-25, 2027-01-01,
  Easter Monday 2027-03-29 and Ascension Day 2027-05-06 returned weekend prices. Corpus Christi
  2027-05-27 (regional) and 12-24 returned weekday prices. This is not in the price list.

### Derived from the trip export

Export format (CSV from the customer portal; an XLSX with the same columns exists):

- `;` separated, UTF-8 with BOM, decimal comma, dates as `DD.MM.YYYY HH:MM:SS`.
- 28 columns: `Datum`, `fahrende Person`, `Buchungsobjekt`, `Kennzeichen`, `Stadt`, `Station`,
  `Wagenklasse`, `Buchungsbeginn`, `Buchungsende`, `Fahrtbeginn`, `Fahrtende`, `Kilometer`,
  `CO² Emission der Fahrt in Gramm`, `Kraftstoffart`, `CO² Emission Fahrzeug in g/km`,
  `Betrag Zeit`, `Betrag Kilometer`, `Betrag Gesamt`, `Währung`, `Mehrwertsteuer`, `Tarif`,
  `Rechnungsdatum`, `Rechnungnummer`, `Verarbeitungsstatus`, `Kommentar`,
  `KommentarKundenService`, `Abteilung`, `Kostenstelle`.
- `Fahrtbeginn` / `Fahrtende` are only filled for recent trips.
- The tariff is given per trip. Base fee and tariff change fee are **not** in the export.
- `Buchungsbeginn` is always on a quarter hour. `Buchungsende` is **not**: it holds the actual
  return time, so the originally booked end is missing.

Findings from recomputing all 84 trips:

- **Km amount: 84 of 84 exact** with base price + 0.01 and the marginal tier from km 101.
- **Time amount: 81 of 84 explained** by this model (inferred):
  1. The return time is rounded up to the next quarter hour; up to there the full price applies.
  2. The remaining booked quarter hours cost 50 %.
  3. The booked end is whatever quarter hour makes the sum match the billed amount.

  Example: start 17:15, return 19:21, AKTIV S, billed 4.98. Full price until 19:30 = 135 min =
  4.72; remainder 0.26 = 15 min at 50 %, so the booking ran until 19:45.
- **Rounding is open.** 75 trips match when both parts are rounded half-up separately; 6 only
  match with a different rounding (parts summed before rounding, or the full-price part rounded
  down). 2.625 is billed as 2.62 and 4.725 as 4.72 in some trips. The exact rule still has to be
  derived (candidates: rounding on net amounts before VAT, half-even, per quarter-hour slot).
- **Unexplained trips** (open):
  - Class L, 7 hours, 0 km, billed 17.85 = exactly 50 % of the full price 35.70. Probably a
    cancelled or unused booking; cancellations therefore seem to appear as ordinary rows with 0 km.
  - Class XL, 9 hours, 0 km, billed 55.08 = the full price.
  - Class S, 5 hours, billed 11.41, which is 0.91 above the full price and fits no quarter-hour
    grid.

A second export covering 2026 contains a single trip (BASIS, class L, a Tuesday in May 2026,
2 h 23 min, 13 km). It confirms the model outside AKTIV/COMFORT:

- Km amount 5.46 = 13 × (0.39 + 0.03), matching the +0.03 surcharge valid from 2026-04-23.
- Time amount 19.67 = 2.5 h at 7.15 (17.875 → 17.88) + 30 min at 50 % (1.7875 → 1.79), with both
  parts rounded half-up separately. Summing before rounding would give 19.66.
- The export format is unchanged in 2026.

Open questions:

- How the 50 % charge interacts with day/week caps and night hours.
- Whether the portal or the invoice PDF shows the originally booked period.

## Price calculator

There is no JSON API. The calculator is a server-rendered form on the tariff page whose hidden
fields are HMAC-signed, so they must be scraped first. A working client is in
[`tools/record-calculator.py`](../../tools/record-calculator.py).

1. `GET https://www.cambio-carsharing.de/tarife` with `Cookie: selectedCity=<uid>`. Take the
   `<form action>` of the calculator (contains a `cHash`) and all hidden inputs
   (`tx_auwcambio_costcalculator[__referrer][…]`, `[__trustedProperties]`).
2. `POST` to that action as `application/x-www-form-urlencoded` with the same cookie, the hidden
   fields and:
   - `tx_auwcambio_costcalculator[startDate]=01.12.2026 10:00` (`DD.MM.YYYY HH:mm`)
   - `tx_auwcambio_costcalculator[endDate]=01.12.2026 13:00`
   - `tx_auwcambio_costcalculator[vehicleClass]=15-393`
   - `tx_auwcambio_costcalculator[distance]=50`

There is no tariff parameter; all tariffs come back at once.

Response: an HTML page. Result rows are `div.costcalculator__item` with `--name`, `--time`, `--km`,
`--total`. For the example above: CAMPUS 8.25 / 14.50 / 22.75, BASIS 9.90 / 15.50 / 25.40,
AKTIV 6.30 / 14.00 / 20.30, COMFORT 5.55 / 12.50 / 18.05.

The raw backend response is also embedded as base64-encoded PHP-serialized data in the hidden
`[__referrer][arguments]` field (strip the 64-character HMAC suffix):

```
response{ data{ bookingPeriod{begin,end}, priceClass{id:"15-25",displayName:"S"}, distance,
  costs[ {tariff{id,displayName}, currencyCode:"EUR", costsDistance, costsTime, costsTotal} ] },
  header{httpStatus, metaInformation{…}, notifications}, success }
```

Tariff ids: 12 Z-START, 118 AKTIV, 119 PROFI, 123 COMFORT, 205 CAMPUS, 217 BASIS.
`costsDistance` is omitted when the distance is 0.

Limits:

- Past dates return an empty `costs` list.
- Km prices include the fuel surcharge valid on the day of the call.
- Early return, cancellation and late return cannot be simulated.
- Not callable from a browser app (CORS, signed fields). Use it only to record test data.

## Price list PDFs

Base URL: `https://www.cambio-carsharing.de/fileadmin/Downloads/`

| File                                                                | Validity                               | Notes                                    |
| ------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------- |
| `Preislisten_Tarife_SonstigeDokumente/Tarife_Privat_26.pdf`         | from 2026-01-15, as of 2026-08-01      | Current                                  |
| `Preislisten_Tarife_SonstigeDokumente/Tarife_Privat_Start_26.pdf`   | same                                   | Variant including START                  |
| `Preislisten_Tarife_SonstigeDokumente/Tarife_Privat_25_02.pdf`      | from 2024-05-02, as of 2025-03-01      | **Applies to all 2025 trips**            |
| `Preislisten_Tarife_SonstigeDokumente/Tarife_Privat_25_12_L.pdf`    | from 2026-01-15, as of 2026-01-15      | `…_25_12_markiert_L.pdf` marks changes   |
| `Preislisten_und_Tarife/Tarife_Privat_24_05.pdf`                    | from 2024-05-02, as of 2024-05-02      | Wayback Machine only; has no XL          |
| `Preislisten_Tarife_SonstigeDokumente/Tarife_Unternehmen_26.pdf`    | not read                               | Business customers                       |

Older lists (`Tarife_Privat_23_06.pdf`, `Tarife_Privat_markiert_24_02_2.pdf`) exist in the Wayback
Machine. Prices before 2024-05-02 were not researched.
