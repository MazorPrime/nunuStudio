/**
 * End-to-end smoke test of the first vertical slice, run against the production build:
 *
 *   open editor → create primitive → create Delver actor → select → inspect →
 *   enter Play → fixed ticks advance, hunger decays, document untouched →
 *   return to Edit → undo/redo → save → reload → project restored → no console errors.
 *
 * Usage: npm run build && npm run smoke
 */

import { chromium } from "playwright-core";
import { preview } from "vite";

const EXECUTABLE = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

function fail(message) {
	console.error("✗ " + message);
	process.exitCode = 1;
}

function ok(message) {
	console.log("✓ " + message);
}

async function assertEqual(actual, expected, label) {
	if (JSON.stringify(actual) === JSON.stringify(expected)) ok(label);
	else fail(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const server = await preview({ preview: { port: 4517, strictPort: true } });
const url = server.resolvedUrls.local[0];
console.log("preview server at", url);

const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on("console", (msg) => {
	if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.goto(url);
await page.waitForSelector("#hierarchy");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector("#hierarchy");
ok("editor loads");

// create a primitive and an actor
await page.click("[data-id=add-box]");
await page.click("[data-id=add-delver]");
const names = await page.$$eval("#hierarchy .tree-item", (els) => els.map((e) => e.textContent));
if (names.some((n) => n.includes("Box 1")) && names.some((n) => n.includes("Delver"))) {
	ok("primitive + Delver appear in hierarchy");
} else fail("hierarchy content wrong: " + JSON.stringify(names));

const doc0 = await page.evaluate(() => window.__mazpon.store.getDoc());
await assertEqual(Object.keys(doc0.entities).length, 2, "two entities in project data");
const delverId = Object.keys(doc0.entities).find((id) => doc0.entities[id].components.actor);
const boxId = Object.keys(doc0.entities).find((id) => !doc0.entities[id].components.actor);
await assertEqual(doc0.entities[delverId].components.needs.entries.hunger.value, 100, "Delver hunger starts at 100");
if (doc0.entities[delverId].id && doc0.entities[boxId].id !== doc0.entities[delverId].id) {
	ok(`stable IDs assigned (${doc0.entities[boxId].id}, ${doc0.entities[delverId].id})`);
}

// select via hierarchy; inspector shows components
await page.click(`#hierarchy .tree-item[data-id="${delverId}"]`);
const compHeads = await page.$$eval("#inspector .comp-head", (els) => els.map((e) => e.textContent));
await assertEqual(
	compHeads,
	["Transform", "Renderable", "Actor", "Species", "Faction", "Needs"],
	"inspector lists Delver components"
);

// transform edit through the inspector lands in the document
await page.fill("#inspector .comp input[type=number]", "3"); // first number field = position X
await page.keyboard.press("Tab");
const movedX = await page.evaluate(
	(id) => window.__mazpon.store.getDoc().entities[id].components.transform.position[0],
	delverId
);
await assertEqual(movedX, 3, "inspector edit updates transform in project data");

// seed is visible
const seed = await page.inputValue("#seed-input");
await assertEqual(seed, "mazpon", "seed visible in status bar");

// Play: ticks advance, hunger decays in the sim, document untouched
await page.click("[data-id=play]");
await page.waitForFunction(() => Number(document.getElementById("tick-value").textContent) >= 10);
const during = await page.evaluate((id) => ({
	tick: window.__mazpon.getSim().tick,
	simHunger: window.__mazpon.getSim().entities[id].components.needs.entries.hunger.value,
	docHunger: window.__mazpon.store.getDoc().entities[id].components.needs.entries.hunger.value
}), delverId);
if (during.tick >= 10) ok(`fixed ticks advance during Play (tick ${during.tick})`);
else fail("ticks did not advance");
if (during.simHunger < 100) ok(`hunger decays in sim (${during.simHunger.toFixed(2)})`);
else fail("hunger did not decay");
await assertEqual(during.docHunger, 100, "project document untouched during Play");

// stop: back to edit, sim discarded
await page.click("[data-id=play]");
const afterStop = await page.evaluate((id) => ({
	sim: window.__mazpon.getSim(),
	docHunger: window.__mazpon.store.getDoc().entities[id].components.needs.entries.hunger.value
}), delverId);
await assertEqual(afterStop.sim, null, "sim discarded on return to Edit");
await assertEqual(afterStop.docHunger, 100, "document intact after Play");

// undo/redo across the transform edit and both creations
await page.click("[data-id=undo]"); // transform edit
await page.click("[data-id=undo]"); // delver
await page.click("[data-id=undo]"); // box
const afterUndo = await page.evaluate(() => Object.keys(window.__mazpon.store.getDoc().entities).length);
await assertEqual(afterUndo, 0, "undo unwinds all creations");
await page.click("[data-id=redo]");
await page.click("[data-id=redo]");
await page.click("[data-id=redo]");
const afterRedo = await page.evaluate((id) => ({
	count: Object.keys(window.__mazpon.store.getDoc().entities).length,
	x: window.__mazpon.store.getDoc().entities[id].components.transform.position[0]
}), delverId);
await assertEqual(afterRedo, { count: 2, x: 3 }, "redo restores entities and the edit");

// save, reload the page, project persists (schema-migrated load path)
await page.click("[data-id=save]");
await page.reload();
await page.waitForSelector("#hierarchy");
const reloaded = await page.evaluate(() => window.__mazpon.store.getDoc());
await assertEqual(Object.keys(reloaded.entities).length, 2, "project survives editor reload");
await assertEqual(reloaded.entities[delverId].components.transform.position[0], 3, "edits survive reload");
await assertEqual(reloaded.schemaVersion, 2, "schema version persisted");

if (consoleErrors.length === 0) ok("no uncaught console errors");
else fail("console errors: " + JSON.stringify(consoleErrors, null, 2));

await browser.close();
await server.close();

if (process.exitCode) {
	console.error("\nSMOKE FAILED");
	process.exit(1);
} else {
	console.log("\nSMOKE PASSED — vertical slice verified end to end");
}
