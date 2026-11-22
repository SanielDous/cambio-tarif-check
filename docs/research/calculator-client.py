"""Minimal client for the price calculator on https://www.cambio-carsharing.de/tarife.

Research helper, not part of the app. See cambio-pricing.md for the protocol.

Usage:
    python calculator-client.py <cityUid> <vehicleClass> "<start>" "<end>" <km> [raw]
    python calculator-client.py 1 15-393 "01.12.2027 10:00" "01.12.2027 13:00" 50

Only future dates return prices. Be polite: pause between calls.
"""
import html
import re
import sys
import urllib.parse
import urllib.request

BASE = "https://www.cambio-carsharing.de"
PREFIX = "tx_auwcambio_costcalculator"


def calc(city, vehicle_class, start, end, km, raw=False):
    headers = {"User-Agent": "Mozilla/5.0", "Cookie": "selectedCity=%s" % city}

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


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf8")
    args = sys.argv
    print(calc(args[1], args[2], args[3], args[4], args[5], raw=len(args) > 6))
