import assert from "node:assert/strict";
import { test } from "node:test";
import { commonsFileName, isDeezerImage, plainText } from "./photo-credit";

test("Commons file names come out of FilePath thumbnails decoded", () => {
  assert.equal(
    commonsFileName("https://commons.wikimedia.org/wiki/Special:FilePath/Taylor%20Swift%202%2C%202019.jpg?width=500"),
    "Taylor Swift 2, 2019.jpg",
  );
  assert.equal(commonsFileName("https://cdn-images.dzcdn.net/images/artist/abc/1000x1000.jpg"), null);
});

test("Commons author HTML becomes plain text", () => {
  assert.equal(plainText('<a href="//commons.wikimedia.org/wiki/User:Jane">Jane &amp; Co</a>\n'), "Jane & Co");
});

test("only Deezer's image CDN counts as a Deezer photo", () => {
  assert.equal(isDeezerImage("https://cdn-images.dzcdn.net/images/artist/abc/1000x1000-000000-80-0-0.jpg"), true);
  assert.equal(isDeezerImage("https://dzcdn.net.evil.com/a.jpg"), false);
  assert.equal(isDeezerImage("not a url"), false);
});
