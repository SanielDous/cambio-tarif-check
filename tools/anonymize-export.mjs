#!/usr/bin/env node
// Anonymises a trip export (CSV or XLSX) of the car-sharing portal so it can be used as a test
// fixture. Run locally only; the personal originals must never be committed.
//
// Usage: node tools/anonymize-export.mjs <in.csv|in.xlsx> <out>
//
// Replaced: driver, booking object, licence plate, station, invoice number (stable pseudonyms per
// distinct value, numbered in order of first appearance). Emptied: comments, department, cost
// centre. Everything else is kept unchanged, including the byte format of the CSV (delimiter,
// BOM, line endings) and the cell types of the XLSX.

import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const COLUMN_RULES = {
  "fahrende Person": { kind: "map", make: (n) => `Person ${letters(n)}` },
  Buchungsobjekt: { kind: "map", make: (n) => `Fahrzeug ${n}` },
  Kennzeichen: { kind: "map", make: (n) => `XX XX ${n}` },
  Station: { kind: "map", make: (n) => `Station ${n}` },
  Rechnungnummer: { kind: "map", make: (n) => String(1000 + n) },
  Kommentar: { kind: "empty" },
  KommentarKundenService: { kind: "empty" },
  Abteilung: { kind: "empty" },
  Kostenstelle: { kind: "empty" },
};

/** 1 -> A, 26 -> Z, 27 -> AA, ... */
function letters(n) {
  let out = "";
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26))
    out = String.fromCharCode(65 + ((i - 1) % 26)) + out;
  return out;
}

/** Builds a function (header, value) -> new value, or null to keep the value. */
function createReplacer() {
  const maps = new Map();
  return (header, value) => {
    const rule = COLUMN_RULES[header];
    if (!rule) return null;
    if (rule.kind === "empty" || value === "") return "";
    let map = maps.get(header);
    if (!map) maps.set(header, (map = new Map()));
    if (!map.has(value)) map.set(value, rule.make(map.size + 1));
    return map.get(value);
  };
}

// ---------------------------------------------------------------- CSV

function parseCsv(text) {
  const records = [];
  let record = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    let raw;
    let value;
    if (text[i] === '"') {
      let j = i + 1;
      value = "";
      for (;;) {
        if (j >= n) throw new Error("Unterminated quoted CSV field");
        if (text[j] === '"') {
          if (text[j + 1] === '"') {
            value += '"';
            j += 2;
            continue;
          }
          break;
        }
        value += text[j++];
      }
      raw = text.slice(i, j + 1);
      i = j + 1;
    } else {
      let j = i;
      while (j < n && text[j] !== ";" && text[j] !== "\r" && text[j] !== "\n") j++;
      raw = value = text.slice(i, j);
      i = j;
    }
    record.push({ raw, value });
    if (text[i] === ";") {
      i++;
      if (i >= n) record.push({ raw: "", value: "" });
      continue;
    }
    const eol = text.startsWith("\r\n", i) ? "\r\n" : (text[i] ?? "");
    records.push({ fields: record, eol });
    record = [];
    i += eol.length;
  }
  if (record.length > 0) records.push({ fields: record, eol: "" });
  return records;
}

function quoteCsv(value) {
  return /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function anonymizeCsv(buffer) {
  const hasBom = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const text = buffer.subarray(hasBom ? 3 : 0).toString("utf8");
  const records = parseCsv(text);
  const header = records[0].fields.map((f) => f.value);
  const replace = createReplacer();
  let out = hasBom ? "﻿" : "";
  records.forEach(({ fields, eol }, rowIndex) => {
    out +=
      fields
        .map(({ raw, value }, col) => {
          if (rowIndex === 0) return raw;
          const replaced = replace(header[col] ?? "", value);
          return replaced === null ? raw : quoteCsv(replaced);
        })
        .join(";") + eol;
  });
  return Buffer.from(out, "utf8");
}

// ---------------------------------------------------------------- XLSX

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (s) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, dec, hex, name) =>
    dec
      ? String.fromCodePoint(+dec)
      : hex
        ? String.fromCodePoint(parseInt(hex, 16))
        : (XML_ENTITIES[name] ?? m),
  );
const escapeXml = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const CELL = /<x:c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/x:c>)/g;
const ROW = /<x:row(?:\s[^>]*)?>[\s\S]*?<\/x:row>/g;

function anonymizeXlsx(buffer) {
  const files = unzipSync(buffer);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheet = files[sheetPath];
  if (!sheet || Object.keys(files).filter((k) => k.startsWith("xl/worksheets/")).length !== 1) {
    throw new Error("Expected exactly one worksheet at " + sheetPath);
  }
  const xml = strFromU8(sheet);
  const replace = createReplacer();
  let header = null;
  const result = xml.replace(ROW, (row) => {
    let col = 0;
    const cells = [];
    const newRow = row.replace(CELL, (cell, attrs = "", inner = "") => {
      const index = col++;
      const isString = /\st="str"/.test(attrs);
      const valueMatch = /^<x:v>([\s\S]*)<\/x:v>$/.exec(inner);
      if (!isString && inner !== "" && !valueMatch) return cell;
      const value = isString && valueMatch ? unescapeXml(valueMatch[1]) : "";
      cells.push(value);
      if (header === null) return cell;
      const name = header[index] ?? "";
      if (!(name in COLUMN_RULES)) return cell;
      if (!isString && valueMatch) throw new Error(`Column "${name}" holds a non-string cell`);
      const replaced = replace(name, value);
      if (replaced === value) return cell;
      return replaced === ""
        ? '<x:c t="str" />'
        : `<x:c t="str"><x:v>${escapeXml(replaced)}</x:v></x:c>`;
    });
    if (header === null) header = cells;
    return newRow;
  });
  const entries = {};
  const mtime = new Date(2000, 0, 1);
  for (const [name, data] of Object.entries(files)) {
    entries[name] = [name === sheetPath ? strToU8(result) : data, { mtime, level: 9 }];
  }
  return Buffer.from(zipSync(entries));
}

// ---------------------------------------------------------------- main

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage: node tools/anonymize-export.mjs <in.csv|in.xlsx> <out>");
  process.exit(2);
}
const extension = extname(input).toLowerCase();
const source = readFileSync(input);
if (extension === ".csv") writeFileSync(output, anonymizeCsv(source));
else if (extension === ".xlsx") writeFileSync(output, anonymizeXlsx(source));
else {
  console.error("Unsupported input type: " + extension);
  process.exit(2);
}
