import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { chromium } from "@playwright/test";

// Uses a built app and an entirely mocked backend. Never sends requests to the
// live SPARK database. Screenshots are written to an ignored local directory.
const build = resolve("build");
const output = resolve("test-results/supper-monitoring");
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const path = resolve(build, `.${decodeURIComponent(new URL(req.url, "http://localhost").pathname)}`);
    if (path !== build && !path.startsWith(build + sep)) { res.writeHead(403).end(); return; }
    const file = path === build ? resolve(build, "index.html") : path;
    const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".gif": "image/gif", ".json": "application/json" };
    res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.SPARK_TEST_BROWSER || "chrome", headless: true });
const records = [];
const pageErrors = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block", hasTouch: viewport.width < 600 });
    const page = await context.newPage();
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.addInitScript(() => sessionStorage.setItem("sparkIntroPlayed", "yes"));
    await page.route("**/*", async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.hostname !== "kkrcxqhfzepifhkryodd.supabase.co") return route.abort();
      let body;
      const args = request.postDataJSON() || {};
      const path = url.pathname;
      if (path.endsWith("/locations")) body = { id: 1, location_code: "1001", school_name: "Test School", active: true };
      else if (path.endsWith("/employees")) body = [{ id: 11, location_id: 1, employee_name: "Test Monitor", active: true }];
      else if (path.endsWith("/has_manager_pin") || path.endsWith("/verify_manager_pin")) body = true;
      else if (path.endsWith("/open_supper_monitoring_session")) body = "TEST-SESSION-ONLY";
      else if (path.endsWith("/close_supper_monitoring_session")) body = null;
      else if (path.endsWith("/list_supper_monitorings")) body = records.map(record => ({ ...record, monitor_name: record.payload.monitorName }));
      else if (path.endsWith("/get_supper_monitoring")) body = records.find(record => record.id === args.p_id);
      else if (path.endsWith("/save_supper_monitoring_draft")) {
        let record = records.find(record => record.id === args.p_id);
        if (!record) { record = { id: `test-${records.length + 1}`, status: "draft", revision: 0 }; records.push(record); }
        Object.assign(record, { payload: args.p_payload, current_section: args.p_section, revision: record.revision + 1, school_year: "2026-27", monitoring_date: args.p_payload.monitoringDate, updated_at: "2026-09-23T20:00:00Z" });
        body = record;
      } else body = [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(origin);
    await page.getByLabel("Location Code").fill("1001");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: /Test Monitor/ }).click();
    await page.getByLabel("4-Digit PIN").fill("1234");
    await page.getByRole("button", { name: /Supper Monitoring/ }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Manager Resources/ }).count(), 1);
    await page.getByRole("button", { name: /Supper Monitoring/ }).click();
    await page.getByLabel("SPARK PIN", { exact: true }).fill("1234");
    await page.getByRole("button", { name: "Open Monitorings", exact: true }).click();
    await page.getByRole("button", { name: "+ Start New Monitoring", exact: true }).click();
    await page.getByLabel("Monitoring date", { exact: true }).fill("2026-09-23");
    await page.getByLabel("Arrival time").fill("14:00");
    await page.getByLabel("Departure time").fill("16:00");
    await page.getByRole("button", { name: "Save & Continue →", exact: true }).click();
    await page.getByLabel("Choose a Monday–Friday week").fill("2026-09-16");
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      await page.getByLabel(`${day} Supper Meal Count`, { exact: true }).fill("100");
      await page.getByLabel(`${day} attendance`, { exact: true }).fill(day === "Tuesday" ? "100" : "101");
    }
    await page.getByRole("button", { name: "Check This Section", exact: true }).click();
    assert.ok((await page.locator("#attendance-1-error").textContent()).includes("higher than"));
    await page.getByLabel("Tuesday attendance", { exact: true }).fill("101");
    assert.ok((await page.locator(".sm-summary").textContent()).includes("100"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "History must fit the viewport without horizontal scrolling");
    assert.equal(await page.evaluate(() => document.querySelector('.login-header').getBoundingClientRect().bottom <= document.querySelector('.sm-main').getBoundingClientRect().top), true, "Wrapped header must not overlap the page");
    await page.screenshot({ path: resolve(output, `history-${viewport.width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Save & Return to Monitorings", exact: true }).click();
    await page.getByRole("button", { name: "Resume", exact: true }).last().click();
    assert.equal(await page.getByLabel("Tuesday attendance", { exact: true }).inputValue(), "101");
    await page.getByLabel("Go to section").selectOption("7");
    await page.getByLabel("ASP Coordinator printed name", { exact: true }).fill("Test Coordinator");
    for (const index of [0, 1]) {
      const pad = page.locator(".sm-signature").nth(index);
      const canvas = pad.locator("canvas");
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      if (viewport.width < 600) {
        const touch = await context.newCDPSession(page);
        await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 25, y: box.y + 55 }] });
        await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 75, y: box.y + 25 }] });
        await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 145, y: box.y + 95 }] });
        await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await touch.detach();
      } else {
        await page.mouse.move(box.x + 25, box.y + 55); await page.mouse.down();
        await page.mouse.move(box.x + 75, box.y + 25, { steps: 5 });
        await page.mouse.move(box.x + 145, box.y + 95, { steps: 7 }); await page.mouse.up();
      }
      await pad.getByLabel("Signature date", { exact: true }).fill("2026-09-23");
      await pad.getByRole("checkbox").check();
      await pad.getByRole("button", { name: "Accept Signature", exact: true }).click();
      assert.ok((await pad.textContent()).includes("Signature accepted for both pages"));
    }
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Draft saved. You can return" }).waitFor();
    if (viewport.width < 600) {
      const portrait = (await page.locator("canvas").first().boundingBox()).height;
      await page.setViewportSize({ width: 844, height: 390 });
      assert.ok((await page.locator("canvas").first().boundingBox()).height > portrait);
      await page.screenshot({ path: resolve(output, "signature-landscape.png"), fullPage: true });
      await page.setViewportSize(viewport);
    }
    await page.getByLabel("Go to section").selectOption("8");
    await page.screenshot({ path: resolve(output, `review-${viewport.width}.png`), fullPage: true });
    await page.getByRole("button", { name: /○ Monitoring Questions/ }).click();
    assert.equal(await page.locator(".sm-card h2").textContent(), "Monitoring Questions");
    await page.getByLabel("Go to section").selectOption("9");
    assert.equal(await page.getByRole("button", { name: "Submit Monitoring", exact: true }).isDisabled(), true);
    await page.getByLabel("Go to section").selectOption("6");
    await page.getByLabel("Comments", { exact: true }).fill("No Findings");
    await page.getByLabel("Go to section").selectOption("7");
    assert.equal(await page.getByText(/Signature accepted for both pages/).count(), 0, "Editing report content must invalidate accepted signatures");
    assert.equal(records[records.length - 1].payload.signatures.monitor, null);
    assert.equal(records[records.length - 1].payload.signatures.coordinator, null);
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  console.log("PASS: desktop/mobile login and Manager Hub, five-day validation, save/resume, signatures, landscape sizing, final review, no horizontal overflow, and submission gate.");
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
