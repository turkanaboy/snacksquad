import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ReleaseTitle } from "./HomeScreen";

const linkedTitle = renderToStaticMarkup(
  <ReleaseTitle title="Cocoa-Dusted Almond Bites" articleUrl="https://example.com/snack" />,
);
assert.match(linkedTitle, /<h3><a href="https:\/\/example\.com\/snack" target="_blank" rel="noreferrer">Cocoa-Dusted Almond Bites<\/a><\/h3>/);

const plainTitle = renderToStaticMarkup(
  <ReleaseTitle title="Everything Hummus Snack Cups" articleUrl={null} />,
);
assert.equal(plainTitle, "<h3>Everything Hummus Snack Cups</h3>");

console.log("home screen tests passed");
