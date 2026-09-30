import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveShowSchema, isValidIsoDate, loginSchema, performerRefSchema } from "./schemas";

test("isValidIsoDate accepts real calendar dates only", () => {
  for (const ok of ["2024-02-29", "2026-09-30", "1999-12-31"]) assert.equal(isValidIsoDate(ok), true, ok);
  for (const bad of ["2023-02-29", "2024-02-31", "2024-13-01", "2024-00-10", "2024-1-01", "24-01-01", "", "2024-01-01T00:00"]) {
    assert.equal(isValidIsoDate(bad), false, bad);
  }
});

test("live shows with impossible dates are rejected before reaching the database", () => {
  const show = { date: "2024-02-31", rating: 8, lineup: [{ performer: { name: "X" } }] };
  assert.equal(createLiveShowSchema.safeParse(show).success, false);
  assert.equal(createLiveShowSchema.safeParse({ ...show, date: "2024-02-29" }).success, true);
});

test("performer photos must be https; anything else is dropped rather than failing the save", () => {
  const url = (imageUrl: string | null) => performerRefSchema.parse({ name: "A", imageUrl }).imageUrl;
  assert.equal(url("https://e-cdns-images.dzcdn.net/images/artist/x/1000x1000.jpg"), "https://e-cdns-images.dzcdn.net/images/artist/x/1000x1000.jpg");
  assert.equal(url("http://example.com/a.jpg"), null);
  assert.equal(url("javascript:alert(1)"), null);
  assert.equal(url(null), null);
});

test("login rejects oversized passwords so hashing can't be used to burn CPU", () => {
  assert.equal(loginSchema.safeParse({ login: "a", password: "x".repeat(200) }).success, true);
  assert.equal(loginSchema.safeParse({ login: "a", password: "x".repeat(201) }).success, false);
});
