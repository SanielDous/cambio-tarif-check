import { describe, expect, it } from "vitest";
import de from "./locales/de/common.json";
import en from "./locales/en/common.json";

function flatten(value: unknown, prefix = ""): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).reduce<Record<string, unknown>>(
      (acc, [key, child]) => ({ ...acc, ...flatten(child, prefix ? `${prefix}.${key}` : key) }),
      {},
    );
  }
  return { [prefix]: value };
}

describe("common locale files", () => {
  const flatDe = flatten(de);
  const flatEn = flatten(en);

  it("have identical key sets", () => {
    expect(Object.keys(flatEn).sort()).toEqual(Object.keys(flatDe).sort());
  });

  it("contain no empty values", () => {
    for (const flat of [flatDe, flatEn]) {
      for (const [key, value] of Object.entries(flat)) {
        expect(typeof value === "string" && value.trim() !== "", key).toBe(true);
      }
    }
  });
});
