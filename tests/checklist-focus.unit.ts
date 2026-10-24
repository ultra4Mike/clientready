import assert from "node:assert/strict";
import { checklistHref, checklistMissing, checklistNeedsPhoto, checklistNote, wantsChecklistFocus } from "../src/lib/checklist";

const items = [{ id: "a", text: "Blow off driveway", done: true }, { id: "b", text: "Close the gate" }, { id: "c", text: "Photo of the back yard" }];
assert.deepEqual(checklistMissing(items).map((i) => i.id), ["b", "c"]);
assert.equal(checklistNote(items), "Needs completing: Close the gate, Photo of the back yard");
assert.equal(checklistNote(items.map((i) => ({ ...i, done: true }))), "");
assert.equal(checklistNeedsPhoto(items[2]), true);
assert.equal(checklistNeedsPhoto(items[1]), false);
assert.equal(checklistNeedsPhoto({ text: "Take pictures" }), true);
assert.equal(checklistNeedsPhoto({ text: "Photograph" }), false);
assert.equal(checklistHref("x y"), "/invoice?id=x%20y&focus=checklist#checklist");
assert.equal(wantsChecklistFocus("?id=1&focus=checklist"), true);
assert.equal(wantsChecklistFocus("?id=1"), false);
console.log("checklist-focus ok");
