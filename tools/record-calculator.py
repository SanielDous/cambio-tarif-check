"""Records responses of the cambio price calculator as test fixtures (JSON lines).

MANUAL USE ONLY. Run this by hand and sparingly: it sends one request pair (page + form) per case
to https://www.cambio-carsharing.de/tarife with a pause of 6 seconds in between. It must never run
in CI, in tests or as part of a build. See docs/research/cambio-pricing.md for the protocol.

Usage:
    python tools/record-calculator.py <out.jsonl>

The output is resumable: cases already present in <out.jsonl> are skipped, new ones are appended.
The JSON lines are then converted to tests/fixtures/calculator-fixtures.json. Only future dates
return prices, so the cases use dates in 2027 and 2028.
"""
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

PAUSE = 6.0
FMT = "%d.%m.%Y %H:%M"

BASE = "https://www.cambio-carsharing.de"
PREFIX = "tx_auwcambio_costcalculator"
# An honest, generic client name; no personal contact.
USER_AGENT = "cambio-tarif-check-fixture-recorder (+https://github.com/SanielDous/cambio-tarif-check)"


def calc(city, vehicle_class, start, end, km, raw=False):
    headers = {"User-Agent": USER_AGENT, "Cookie": "selectedCity=%s" % city}

    # Step 1: load the page and scrape the signed form (action with cHash + hidden fields).
    page = urllib.request.urlopen(urllib.request.Request(BASE + "/tarife", headers=headers))
    text = page.read().decode("utf8")
    form = re.search(r'<form action="([^"]*costcalculator[^"]*)".*?</form>', text, re.S)
    action = html.unescape(form.group(1)).split("#")[0]
    data = [
        (name, html.unescape(value))
        for name, value in re.findall(
            r'<input type="hidden" name="([^"]+)" value="([^"]*)"', form.group(0)
        )
    ]

    # Step 2: submit the form with the trip parameters.
    data += [
        (PREFIX + "[startDate]", start),
        (PREFIX + "[endDate]", end),
        (PREFIX + "[vehicleClass]", vehicle_class),
        (PREFIX + "[distance]", str(km)),
    ]
    request = urllib.request.Request(
        BASE + action,
        data=urllib.parse.urlencode(data).encode(),
        headers={**headers, "Content-Type": "application/x-www-form-urlencoded"},
    )
    result = urllib.request.urlopen(request).read().decode("utf8")

    match = re.search(
        r'id="js-price-calculator".*?(?=class="[^"]*tariftabelle|Welcher Tarif passt)', result, re.S
    )
    section = match.group(0) if match else result
    if raw:
        return section
    section = re.sub(r"<form.*?</form>", "", section, flags=re.S)
    section = html.unescape(re.sub(r"<[^>]+>", "\n", section))
    return re.sub(r"\s*\n\s*", " | ", section)


AACHEN = {"S": "15-393", "M": "15-455", "L": "15-54", "XL": "15-672"}
cases = []


def add(group, start, minutes, km=0, cls="S", city=1, vc=None):
    s = dt.datetime.strptime(start, FMT)
    e = s + dt.timedelta(minutes=minutes)
    cases.append({"group": group, "city": city, "vehicleClass": vc or AACHEN[cls], "priceClass": cls,
                  "start": s.strftime(FMT), "end": e.strftime(FMT), "km": km})


H, D = 60, 1440
# Tuesday 2027-03-02 is an ordinary weekday.
for m in (15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 4 * H, 5 * H, 7 * H, 9 * H, 11 * H, 12 * H, 13 * H):
    add("duration", "02.03.2027 06:00", m)
for m in (18 * H, 23 * H, 24 * H, 25 * H, 26 * H, 30 * H, 34 * H, 36 * H, 37 * H, 47 * H, 48 * H, 49 * H):
    add("day-cap", "02.03.2027 06:00", m)
for m in (3 * D, 5 * D, 5 * D + 10 * H, 6 * D, 7 * D, 8 * D, 10 * D, 13 * D, 14 * D, 15 * D, 29 * D, 30 * D):
    add("week-cap", "02.03.2027 10:00", m)
for st in ("20:00", "22:00", "23:00", "23:30"):
    for m in (H, 2 * H, 4 * H, 10 * H):
        add("night", "02.03.2027 " + st, m)
for st in ("00:00", "03:00", "05:00", "05:30", "05:45"):
    for m in (H, 3 * H):
        add("night", "03.03.2027 " + st, m)
# Weekend boundaries: Friday 2027-03-05, Saturday 06, Sunday 07, Monday 08.
for st, m in (("05.03.2027 10:00", H), ("05.03.2027 11:00", 2 * H), ("05.03.2027 11:45", 30), ("05.03.2027 12:00", H),
              ("05.03.2027 18:00", 16 * H), ("05.03.2027 06:00", 30 * H), ("04.03.2027 20:00", 18 * H),
              ("06.03.2027 06:00", 10 * H), ("06.03.2027 06:00", 12 * H), ("06.03.2027 10:00", 24 * H),
              ("06.03.2027 10:00", 4 * H), ("07.03.2027 20:00", 12 * H), ("08.03.2027 05:00", 2 * H),
              ("08.03.2027 06:00", H), ("08.03.2027 05:45", 30), ("05.03.2027 10:00", 4 * D), ("06.03.2027 08:00", 9 * D)):
    add("weekend", st, m)
# Public holidays (nationwide) and regional / special days.
for day in ("01.01.2027", "26.03.2027", "29.03.2027", "06.05.2027", "17.05.2027", "01.05.2028", "03.10.2028",
            "25.12.2028", "26.12.2028", "06.01.2027", "27.05.2027", "01.11.2027", "24.12.2027", "31.12.2027", "31.10.2028"):
    add("holiday", day + " 10:00", 2 * H)
for st, m in (("05.05.2027 18:00", 4 * H), ("05.05.2027 22:00", 4 * H), ("06.05.2027 00:00", 8 * H),
              ("06.05.2027 05:00", 2 * H), ("06.05.2027 22:00", 4 * H), ("07.05.2027 00:00", 8 * H),
              ("07.05.2027 05:00", 3 * H), ("07.05.2027 08:00", 2 * H), ("06.05.2027 06:00", 12 * H),
              ("05.05.2027 12:00", 48 * H)):
    add("holiday-edge", st, m)
for km in (1, 50, 99, 100, 101, 150, 250, 500, 1000, 1500):
    add("km", "02.03.2027 10:00", 3 * H, km)
for cls in ("M", "L", "XL"):
    for m in (15, 45, 75, 105):
        add("rounding", "02.03.2027 10:00", m, 0, cls)
    add("class", "02.03.2027 10:00", 3 * H, 50, cls)
    add("class", "02.03.2027 06:00", 26 * H, 150, cls)
    add("class", "06.03.2027 10:00", 4 * H, 20, cls)
    add("class", "02.03.2027 10:00", 8 * D, 600, cls)
    add("class", "02.03.2027 22:00", 10 * H, 101, cls)
for st, m in (("02.03.2027 10:00", 7), ("02.03.2027 10:00", 83), ("02.03.2027 10:05", 100), ("02.03.2027 05:50", 20)):
    add("odd-minutes", st, m)
# XS exists in Köln, tariff START in Hamburg.
for st, m, km in (("02.03.2027 10:00", 3 * H, 50), ("02.03.2027 06:00", 26 * H, 150), ("06.03.2027 10:00", 4 * H, 20),
                  ("02.03.2027 10:00", 75, 0), ("02.03.2027 10:00", 8 * D, 600)):
    add("xs", st, m, km, "XS", 21, "12-516")
for cls, vc in (("S", "31-393"), ("M", "31-455"), ("L", "31-54")):
    for st, m, km in (("02.03.2027 10:00", 3 * H, 50), ("02.03.2027 06:00", 26 * H, 150), ("06.03.2027 10:00", 75, 101)):
        add("start-tariff", st, m, km, cls, 16, vc)


def money(s):
    s = s.strip()
    if s in ("", "-"):
        return None
    return float(s.replace(".", "").replace(",", ".").replace("€", "").strip())


def main(out):
    done = set()
    if os.path.exists(out):
        with open(out, encoding="utf8") as f:
            done = {json.dumps(json.loads(line)["request"], sort_keys=True) for line in f if line.strip()}

    print("cases", len(cases), "already recorded", len(done), flush=True)
    fails = 0
    for i, c in enumerate(cases):
        if json.dumps(c, sort_keys=True) in done:
            continue
        try:
            raw = calc(c["city"], c["vehicleClass"], c["start"], c["end"], c["km"], raw=True)
            items = re.findall(
                r'costcalculator__item--name[^>]*>([^<]*)<.*?--time">([^<]*)<.*?--km">([^<]*)<.*?--total">([^<]*)<',
                raw,
                re.S,
            )
            costs = {
                n.strip(): {"time": money(t), "km": money(k), "total": money(tot)}
                for n, t, k, tot in items
            }
            if not costs:
                raise ValueError("no cost rows in response")
            entry = {
                "request": c,
                "recordedAt": dt.datetime.now().isoformat(timespec="seconds"),
                "costs": costs,
            }
            with open(out, "a", encoding="utf8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            fails = 0
        except Exception as ex:  # keep going, report at the end
            fails += 1
            print("FAILED", i, c["group"], c["start"], c["end"], repr(ex)[:200], flush=True)
            if fails >= 5:
                print("ABORT: 5 consecutive failures", flush=True)
                sys.exit(1)
        time.sleep(PAUSE)
    with open(out, encoding="utf8") as f:
        print("DONE recorded", sum(1 for _ in f), "of", len(cases), flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.stdout.reconfigure(encoding="utf8")
    main(sys.argv[1])
