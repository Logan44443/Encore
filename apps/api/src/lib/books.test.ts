import assert from "node:assert/strict";
import { test } from "node:test";
import { authorLine, bookGenres, coverUrl, workNumber } from "./books";

const names = (subjects: string[]) => bookGenres(subjects).map((g) => g.name);

test("work keys map to numbers and back", () => {
  assert.equal(workNumber("/works/OL45804W"), 45804);
  assert.equal(workNumber("/books/OL7353617M"), null);
  assert.equal(coverUrl(240727), "https://covers.openlibrary.org/b/id/240727-L.jpg");
  assert.equal(coverUrl(-1), null);
});

test("author lines stay short", () => {
  assert.equal(authorLine(["Andy Weir"]), "Andy Weir");
  assert.equal(authorLine(["Terry Pratchett", "Neil Gaiman", "Terry Pratchett"]), "Terry Pratchett & Neil Gaiman");
  assert.equal(authorLine(["A", "B", "C"]), "A & others");
  assert.equal(authorLine([]), null);
});

test("subjects become Encore genres, with a broad one last", () => {
  assert.deepEqual(names(["Science fiction", "Space flight", "Fiction, science fiction, general", "Astronauts"]), ["Science Fiction", "Fiction"]);
  assert.deepEqual(names(["Fantasy fiction", "Magic -- Fiction", "Dragons", "Wizards"]), ["Fantasy", "Fiction"]);
  assert.deepEqual(names(["Biography", "Presidents -- United States -- Biography"]), ["Biography & Memoir", "Nonfiction"]);
  // A novel set in a war is historical fiction, not History.
  assert.deepEqual(names(["World War, 1939-1945 -- Fiction", "Historical fiction"]), ["Historical Fiction", "Fiction"]);
  assert.deepEqual(names(["Detective and mystery stories", "Fiction, mystery & detective, general"]), ["Mystery & Thriller", "Fiction"]);
  assert.deepEqual(names([]), ["Nonfiction"]);
  assert.deepEqual(names(["Novels"]), ["Fiction"]);
});
