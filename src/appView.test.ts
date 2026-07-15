import assert from "node:assert/strict";
import { appViewFromSearch, searchForAppView } from "./appView";

assert.equal(appViewFromSearch("?view=profile"), "profile");
assert.equal(appViewFromSearch("?view=fantasy&league=league-id"), "fantasy");
assert.equal(appViewFromSearch("?view=unknown"), "home");
assert.equal(searchForAppView("?campaign=pilot&league=league-id", "profile"), "?campaign=pilot&view=profile");
assert.equal(searchForAppView("?campaign=pilot&league=league-id", "fantasy"), "?campaign=pilot&league=league-id&view=fantasy");
assert.equal(searchForAppView("?campaign=pilot&league=league-id&view=log", "home"), "?campaign=pilot");

console.log("app view tests passed");
