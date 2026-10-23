import assert from "node:assert/strict";
import { test } from "node:test";
import { bestBookMatch, bookTitle, parseGoodreads } from "./goodreads";

const HEADER =
  "Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies";

test("parseGoodreads reads shelves, stars, ISBNs and dates", () => {
  const csv = [
    HEADER,
    '2767052,"The Hunger Games (The Hunger Games, #1)",Suzanne Collins,"Collins, Suzanne",,"=""0439023483""","=""9780439023481""",4,4.31,Scholastic,Hardcover,374,2008,2008,2019/05/21,2019/05/01,,,read,"Loved it.<br/>Really.",,,1,0',
    '11,Dune,Frank Herbert,"Herbert, Frank",,"=""""","=""""",0,4.27,Ace,Paperback,604,1990,1965,,2020/01/02,to-read,to-read (#1),to-read,,,,0,0',
    '12,Middlemarch,George Eliot,"Eliot, George",,,,0,3.9,,,,,1871,,2021/03/03,,,currently-reading,,,,0,0',
  ].join("\n");
  const books = parseGoodreads(csv)!;
  assert.equal(books.length, 3);
  assert.deepEqual(books[0], {
    key: "2767052",
    name: "The Hunger Games (The Hunger Games, #1)",
    author: "Suzanne Collins",
    year: 2008,
    isbns: ["9780439023481", "0439023483"],
    rating: 4,
    watchedAt: "2019-05-21",
    loggedAt: "2019-05-01",
    review: "Loved it.\nReally.",
    watched: true,
  });
  assert.equal(books[1].year, 1965);
  assert.deepEqual(books[1].isbns, []);
  assert.equal(books[1].rating, null);
  assert.equal(books[1].watched, false);
  assert.equal(books[2].watched, false);
});

test("parseGoodreads rejects other CSVs", () => {
  assert.equal(parseGoodreads("Name,Year,Rating\nAlien,1979,5"), null);
});

test("book titles lose their series and match by title and author", () => {
  assert.equal(bookTitle("Catching Fire (The Hunger Games, #2)"), "Catching Fire");
  assert.equal(bookTitle("Words of Radiance (The Stormlight Archive, #2.5)"), "Words of Radiance");
  const results = [
    { name: "Catching Fire", author: "Somebody Else" },
    { name: "Catching Fire", author: "Suzanne Collins" },
    { name: "Catching Fire: The Official Illustrated Companion", author: "Kate Egan" },
  ];
  assert.equal(bestBookMatch({ name: "Catching Fire (The Hunger Games, #2)", author: "Suzanne Collins" }, results), results[1]);
  assert.equal(bestBookMatch({ name: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari" }, [{ name: "Sapiens", author: "Yuval Noah Harari" }])?.name, "Sapiens");
  assert.equal(bestBookMatch({ name: "Catching Fire", author: "Nobody" }, results), null);
});
