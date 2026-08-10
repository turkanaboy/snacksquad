import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { StarRating, StarRatingPicker } from "./StarRating";

const display = renderToStaticMarkup(<StarRating rating={4} label="Your rating" />);
assert.match(display, /aria-label="Your rating: 4 out of 5 stars"/);
assert.equal((display.match(/class="filled"/g) || []).length, 4);

const picker = renderToStaticMarkup(<StarRatingPicker value={3} onChange={() => undefined} />);
assert.match(picker, /aria-label="5 stars"/);
assert.match(picker, /3 out of 5 stars/);
assert.equal((picker.match(/class="selected"/g) || []).length, 3);

console.log("star rating tests passed");
