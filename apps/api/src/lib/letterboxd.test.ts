import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { bestMatch, parseCsv, parseExport, plainReview } from "./letterboxd";
import { readZip } from "./zip";

test("parseCsv handles quotes, commas, newlines and a BOM", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\n'), [
    ["a", "b"],
    ["x, y", 'say "hi"\nthere'],
  ]);
});

test("parseExport merges files by film, preferring ratings.csv and the latest diary date", () => {
  const { films, recognised } = parseExport([
    { name: "ratings.csv", text: "Date,Name,Year,Letterboxd URI,Rating\n2020-01-01,Heat,1995,u,4.5\n" },
    {
      name: "diary.csv",
      text: "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2021-01-01,Heat,1995,a,3,,,2020-12-31\n2023-01-01,Heat,1995,b,4,Yes,,2022-12-31\n2022-01-01,Ronin,1998,c,3.5,,,2021-12-31\n",
    },
    { name: "watched.csv", text: "Date,Name,Year,Letterboxd URI\n2019-06-01,Heat,1995,u\n2019-06-02,Thief,1981,u\n" },
    { name: "watchlist.csv", text: "Date,Name,Year,Letterboxd URI\n2024-01-01,Heat,1995,u\n2024-01-02,Collateral,2004,u\n" },
    { name: "likes/films.csv", text: "Date,Name,Year,Letterboxd URI\n2024-01-01,Ignored,2000,u\n" },
  ]);
  assert.deepEqual(recognised.sort(), ["diary", "ratings", "watched", "watchlist"]);
  const byName = Object.fromEntries(films.map((f) => [f.name, f]));
  assert.equal(byName.Heat.rating, 4.5);
  assert.equal(byName.Heat.watchedAt, "2022-12-31");
  assert.equal(byName.Heat.loggedAt, "2019-06-01");
  assert.equal(byName.Heat.watchlist, false, "a watched film isn't also put on the watchlist");
  assert.equal(byName.Ronin.rating, 3.5);
  assert.equal(byName.Thief.rating, null);
  assert.equal(byName.Collateral.watched, false);
  assert.equal(byName.Collateral.watchlist, true);
  assert.equal(byName.Ignored, undefined);
});

test("plainReview keeps the text of Letterboxd's review HTML", () => {
  assert.equal(plainReview("Great <i>fun</i> &amp; games.<br />Again!"), "Great fun & games.\nAgain!");
  assert.equal(plainReview("  "), null);
});

test("bestMatch only accepts confident matches", () => {
  const results = [
    { name: "Dune", year: 1984 },
    { name: "Dune", year: 2021 },
    { name: "Dune: Part Two", year: 2024 },
  ];
  assert.deepEqual(bestMatch({ name: "Dune", year: 2021 }, results), { name: "Dune", year: 2021 });
  assert.deepEqual(bestMatch({ name: "Dune", year: 1985 }, results), { name: "Dune", year: 1984 });
  assert.equal(bestMatch({ name: "Dune", year: null }, results), null, "two films share the name");
  assert.deepEqual(bestMatch({ name: "Dune Part Two", year: 2024 }, results), { name: "Dune: Part Two", year: 2024 });
  assert.equal(bestMatch({ name: "Something Else", year: 2024 }, results), null);
  assert.deepEqual(bestMatch({ name: "Amélie", year: 2001 }, [{ name: "Amelie", year: 2001 }]), { name: "Amelie", year: 2001 });
});

/** A one-file ZIP, deflated, built by hand. */
function zipOf(name: string, content: string): Buffer {
  const data = Buffer.from(content);
  const packed = deflateRawSync(data);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const cdAt = local.length + nameBuf.length + packed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBuf.length, 12);
  end.writeUInt32LE(cdAt, 16);
  return Buffer.concat([local, nameBuf, packed, central, nameBuf, end]);
}

test("readZip inflates entries and refuses ones over the size cap", () => {
  const zip = zipOf("ratings.csv", "Name,Year\n".repeat(100));
  assert.equal(readZip(zip, () => true, 10_000).get("ratings.csv")?.toString(), "Name,Year\n".repeat(100));
  assert.equal(readZip(zip, () => false, 10_000).size, 0);
  assert.throws(() => readZip(zip, () => true, 100), /too large/);
  assert.throws(() => readZip(Buffer.from("not a zip at all, sorry"), () => true, 100), /Not a ZIP/);
});
