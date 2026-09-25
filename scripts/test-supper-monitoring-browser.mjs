import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createHandler } from "../api/supper-monitoring.js";
import { makeFixture } from "./supper-monitoring-fixture.mjs";

// Uses a built app and an entirely mocked backend. Never sends requests to the
// live SPARK database. Screenshots are written to an ignored local directory.
const build = resolve("build");
const output = resolve("test-results/supper-monitoring");
await mkdir(output, { recursive: true });
const records = [];
const documents = new Map();
const token = randomUUID() + randomUUID();
const reportHandler = createHandler({ database: {
  async rpc(name,args) {
    const record = records.find(r => r.id === args.p_id);
    if (args.p_token !== token || !record) return { error: { message: 'Session expired.' } };
    if (name === 'get_supper_monitoring') return { data: record };
    if (name === 'read_supper_monitoring_pdf') return { data: documents.get(record.id) };
    if (name === 'finalize_supper_monitoring') {
      documents.set(record.id,args.p_pdf_base64);
      Object.assign(record,{status:'submitted',document_version:1,revision:record.revision+1,submitted_at:new Date().toISOString(),current_section:8});
      return {data:record};
    }
    throw new Error(name);
  },
  from() { return { select() { return { eq() { return { async single() { return {data:{school_name:'Test School',location_code:'1001'}}; } }; } }; } }; }
} });
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/api/monitoring') {
      let body = ''; for await (const chunk of req) body += chunk;
      req.body = JSON.parse(body);
      res.status = code => { res.statusCode = code; return res; };
      res.json = value => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value)); };
      res.send = value => res.end(value);
      await reportHandler(req,res); return;
    }
    const path = resolve(build, `.${decodeURIComponent(new URL(req.url, "http://localhost").pathname)}`);
    if (path !== build && !path.startsWith(build + sep)) { res.writeHead(403).end(); return; }
    const file = path === build ? resolve(build, "index.html") : path;
    const types = { ".html": "text/html", ".js": "application/javascript", ".mjs":"application/javascript", ".wasm":"application/wasm", ".css": "text/css", ".png": "image/png", ".gif": "image/gif", ".json": "application/json" };
    res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.SPARK_TEST_BROWSER || "chrome", headless: true });
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
      else if (path.endsWith("/open_supper_monitoring_session")) body = token;
      else if (path.endsWith("/supper_context")) body = {actor_role:"manager",employee_id:11,monitor_name:"Test Monitor",allow_manager_uploads:true};
      else if (path.endsWith("/close_supper_monitoring_session")) body = null;
      else if (path.endsWith("/list_supper_monitorings")) body = records.map(record => ({ ...record, monitor_name: record.payload.monitorName }));
      else if (path.endsWith("/get_supper_monitoring")) body = records.find(record => record.id === args.p_id);
      else if (path.endsWith("/save_supper_monitoring_draft")) {
        let record = records.find(record => record.id === args.p_id);
        if (!record) { record = { id: randomUUID(), location_id: 1, status: "draft", source:"generated", monitor_role:"manager",created_by_employee_id:11, revision: 0 }; records.push(record); }
        Object.assign(record, { payload: args.p_payload, monitoring_slot: args.p_payload.monitoringSlot, current_section: args.p_section, revision: record.revision + 1, school_year: "2026-27", monitoring_date: args.p_payload.monitoringDate, updated_at: "2026-09-23T20:00:00Z" });
        body = record;
      } else body = [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(origin);
    await page.getByLabel("Location Code").fill("1001");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: /Test Monitor/ }).click();
    await page.getByLabel("4-Digit PIN").fill("1234");
    await page.getByRole("button", { name: /Monitoring/ }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Manager Resources/ }).count(), 1);
    assert.deepEqual(await page.locator(".homebase-grid strong").allTextContents(), ["School Dashboard", "Daily Bites", "Monitoring", "Incident Record Helper", "Manager Resources", "Monthly Scorecard"]);
    // Current-main routes must survive the Supper Monitoring integration.
    await page.getByRole('button',{name:/Monthly Scorecard/}).click();
    await expect(page.getByRole('heading',{name:'Monthly Scorecard',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'← Back to Home Base',exact:true}).click();
    await page.getByRole('button',{name:/Manager Resources/}).click();
    await page.getByRole('button',{name:/How to Earn SPARK Points/}).click();
    await expect(page.getByRole('heading',{name:'How to Earn SPARK Points',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'← Back to Manager Resources',exact:true}).click();
    await page.getByRole('button',{name:'← Back to Home Base',exact:true}).click();
    await page.getByRole('button',{name:/Incident Record Helper/}).click();
    await expect(page.getByRole('heading',{name:'Incident Record Helper',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'← Back to Home Base',exact:true}).click();
    await page.getByRole('button',{name:/Daily Bites/}).click();
    await expect(page.getByRole('heading',{name:'Daily Bites',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'← Home Base',exact:true}).click();
    await page.getByRole("button", { name: /Monitoring/ }).click();
    await expect(page.getByRole("button", { name: /Supper 1 - Test School.*Not Started/ })).toBeVisible();
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await page.getByRole("button", { name: /Supper 1 - Test School.*Not Started/ }).click();
    await page.getByLabel("Monitoring date", { exact: true }).fill("2026-09-23");
    await page.getByLabel("Arrival time").fill("14:00");
    await page.getByLabel("Departure time").fill("16:00");
    assert.equal(await page.getByText("Was this visit unannounced?",{exact:true}).count(),0);
    await page.getByRole('button',{name:'+ Add Service Time',exact:true}).click();
    await page.locator('#program-0').fill('Youth Enrichment');
    await page.locator('#start-0').fill('15:02');await expect(page.locator('#end-0')).toHaveValue('15:32');await expect(page.locator('#end-0')).toHaveAttribute('readonly','');await page.locator('#start-0').fill('14:30');await expect(page.locator('#end-0')).toHaveValue('15:00');
    await page.getByRole("button", { name: "Save & Continue →", exact: true }).click();
    await page.getByLabel("Go to section").selectOption("0");
    await page.getByRole('button',{name:'+ Add Service Time',exact:true}).click();
    await page.locator('#program-1').fill('Community Learning');
    await page.locator('#start-1').fill('16:00');await expect(page.locator('#end-1')).toHaveValue('16:30');
    await page.getByRole('button',{name:'+ Add Service Time',exact:true}).click();
    await page.locator('#program-2').fill('Youth Enrichment');
    await page.getByLabel('Day for service 3',{exact:true}).selectOption('Tuesday');
    await page.locator('#start-2').fill('12:00');await expect(page.locator('#end-2')).toHaveValue('12:30');
    await page.getByLabel('Arrival time',{exact:true}).fill('14:30');
    await page.getByRole('button',{name:'Save & Continue →',exact:true}).click();
    await expect(page.locator('#arrivalTime-error')).toContainText('before the approved Supper service start time of 2:30 PM');
    await expect(page.locator('#departureTime-error')).toContainText('after the approved Supper service end time of 4:30 PM');
    await page.getByLabel('Arrival time',{exact:true}).fill('14:15');await page.getByLabel('Departure time',{exact:true}).fill('16:31');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'Service table fits desktop/mobile');
    await page.screenshot({path:resolve(output,`services-${viewport.width}.png`),fullPage:true});
    await page.getByRole('button',{name:'Save & Continue →',exact:true}).click();
    await page.getByLabel("Choose a Monday–Friday week").fill("2026-09-16");
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      await page.getByLabel(`${day} Supper Meal Count`, { exact: true }).fill("100");
      await page.getByLabel(`${day} attendance`, { exact: true }).fill(day === "Tuesday" ? "100" : "101");
    }
    await expect(page.getByText(/100% of the program attendance/)).toBeVisible();
    await page.getByLabel("Confirm Numbers Are Correct",{exact:true}).check();
    await expect(page.locator("#attendance-1-error")).toHaveCount(0);
    await page.getByLabel("Tuesday attendance", { exact: true }).fill("99");
    await expect(page.locator("#attendance-1-error")).toContainText("Attendance cannot be lower");
    await page.getByLabel("Tuesday attendance", { exact: true }).fill("101");
    await page.getByLabel("Monday Supper Meal Count",{exact:true}).fill("0");
    await expect(page.getByRole('button',{name:'Select Different Week',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Save & Continue →',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Five-Day History',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Select Different Week',exact:true}).click();
    await expect(page.locator('#weekStart')).toBeFocused();
    await page.getByLabel("Monday Supper Meal Count",{exact:true}).fill("100");

    await page.getByLabel("I Verified These Numbers",{exact:true}).check();
    assert.ok((await page.locator(".sm-summary").textContent()).includes("100"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "History must fit the viewport without horizontal scrolling");
    assert.equal(await page.evaluate(() => document.querySelector('.login-header').getBoundingClientRect().bottom <= document.querySelector('.sm-main').getBoundingClientRect().top), true, "Wrapped header must not overlap the page");
    await page.screenshot({ path: resolve(output, `history-${viewport.width}.png`), fullPage: true });
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    const pageNav=page.getByRole('navigation',{name:'SPARK page navigation'});
    await expect(pageNav).toBeInViewport();
    await pageNav.getByRole('button',{name:'← Monitoring',exact:true}).click();
    await page.getByRole("button", { name: "Resume", exact: true }).last().click();
    assert.equal(await page.getByLabel("Tuesday attendance", { exact: true }).inputValue(), "101");
    await page.getByLabel('Go to section').selectOption('2');
    await expect(page.getByText('Monitoring Date: September 23, 2026',{exact:true})).toBeVisible();
    assert.equal(await page.getByLabel('Adult meals',{exact:true}).count(),0);
    assert.equal(await page.getByLabel('Service start time',{exact:true}).count(),0);
    await page.getByLabel("Today's Supper Meal Count",{exact:true}).fill('100');
    await page.getByLabel("Today's Attendance",{exact:true}).fill('99');
    await expect(page.locator('#todayAttendance-error')).toContainText('Attendance cannot be lower');
    await page.getByRole('button',{name:'Save & Continue →',exact:true}).click();
    await expect(page.getByRole('heading',{name:"Today's Supper Information",exact:true})).toBeVisible();
    await page.getByLabel("Today's Attendance",{exact:true}).fill('100');
    await expect(page.getByText(/100% of the program attendance/)).toBeVisible();
    await page.getByLabel('Confirm Numbers Are Correct',{exact:true}).check();
    await page.getByRole('button',{name:'Save & Continue →',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Menu & Serving Sizes',exact:true})).toBeVisible();
    await page.getByLabel('Milk 1 fat type',{exact:true}).selectOption('1%');await page.getByLabel('Milk 1 description/flavor',{exact:true}).fill('White');await page.getByLabel('Milk 1 serving size',{exact:true}).fill('8 oz');
    await page.getByLabel('Milk 2 fat type',{exact:true}).selectOption('Nonfat');await page.getByLabel('Milk 2 description/flavor',{exact:true}).fill('Chocolate');await page.getByLabel('Milk 2 serving size',{exact:true}).fill('8 oz');
    for(let i=1;i<5;i++){await page.locator('#menu-'+i).fill(['','Chicken','Whole-grain roll','Apples','Carrots'][i]);await page.locator('#serving-'+i).fill('1/2 cup');}
    assert.equal(await page.locator('.sm-menu-row').count(),8);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'Menu fits desktop/mobile');
    await page.screenshot({path:resolve(output,`menu-${viewport.width}.png`),fullPage:true});
    await page.getByRole('button',{name:'Save & Continue →',exact:true}).click();
    await expect(page.getByRole('group',{name:'Question 20',exact:true})).toBeVisible();
    await page.getByRole('group',{name:'Question 18a',exact:true}).getByRole('button',{name:'Yes',exact:true}).click();
    await page.getByRole('group',{name:'Question 18b',exact:true}).getByRole('button',{name:'No',exact:true}).click();
    await expect(page.getByLabel('Repeated findings for 18b',{exact:true})).toBeVisible();
    await page.getByRole('group',{name:'Question 19',exact:true}).getByRole('button',{name:'Yes',exact:true}).click();
    await expect(page.locator('#action-19-training')).toBeVisible();
    await page.getByRole('group',{name:'Question 20',exact:true}).getByRole('button',{name:'No',exact:true}).click();
    await expect(page.locator('#action-20-followUpPlan')).toBeVisible();
    await page.getByRole('group',{name:'Question 18a',exact:true}).getByRole('button',{name:'No',exact:true}).click();
    await page.getByRole('group',{name:'Question 19',exact:true}).getByRole('button',{name:'No',exact:true}).click();
    await page.getByRole('group',{name:'Question 20',exact:true}).getByRole('button',{name:'Yes',exact:true}).click();
    await expect(page.locator('#action-19-training')).toHaveCount(0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'Question list fits desktop/mobile');
    await page.screenshot({path:resolve(output,`questions-${viewport.width}.png`),fullPage:true});
    await page.getByLabel("Go to section").selectOption("7");

    for (const index of [0, 1]) {
      if(index===1) {await page.getByLabel("After School Program Coordinator printed name", { exact: true }).fill("Test Coordinator");await expect(page.getByText(/Signature accepted for both pages/)).toHaveCount(1);}
      const pad = page.locator(".sm-signature").nth(index);
      await expect(pad.locator('canvas')).toHaveCount(0);
      await pad.getByRole('button',{name:'Sign with Finger',exact:true}).click();
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
    await expect(page.locator(".sm-card h2")).toHaveText("Monitoring Questions");
    await page.getByLabel("Go to section").selectOption("9");
    assert.equal(await page.getByRole("button", { name: "Submit Monitoring", exact: true }).isDisabled(), true);
    await page.getByLabel("Go to section").selectOption("6");
    await page.getByLabel("Comments", { exact: true }).fill("No Findings");
    await page.getByLabel("Go to section").selectOption("7");
    await expect(page.getByRole("heading",{name:"Names & Signatures",exact:true})).toBeVisible();
    assert.equal(await page.getByText(/Signature accepted for both pages/).count(), 0, "Editing report content must invalidate accepted signatures");
    assert.equal(records[records.length - 1].payload.signatures.monitor, null);
    assert.equal(records[records.length - 1].payload.signatures.coordinator, null);
    await page.getByRole('button', {name:'Save & Return to Monitorings',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Drafts / In Progress',exact:true})).toBeVisible();
    const complete = records[records.length - 1];
    complete.payload = makeFixture(false);
    delete complete.payload.serviceTimes;delete complete.payload.guidedVersion;
    complete.current_section=0;
    await page.getByRole('button',{name:'Resume',exact:true}).last().click();
    await expect(page.getByText(/Previously entered approved time:/)).toBeVisible();
    await expect(page.locator('#start-0')).toHaveValue('14:30');
    await page.getByLabel('I verified this program, day and times against the CDE approval.',{exact:true}).click();
    await expect(page.getByLabel('I verified this program, day and times against the CDE approval.',{exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Save & Return to Monitorings',exact:true}).click();
    assert.equal(complete.payload.serviceTimes[0].needsConfirmation,false);
    assert.equal(complete.payload.signatures.monitor,null,'Legacy content upgrade requires renewed signatures');
    complete.payload = makeFixture(false);
    complete.current_section = 4;
    await page.getByRole('button', {name:'Resume',exact:true}).last().click();
    await expect(page.getByRole('heading',{name:'Monitoring Questions',exact:true})).toBeVisible();
    await expect(page.getByRole("group",{name:"Question 2",exact:true})).toBeVisible();
    assert.equal(await page.locator(".sm-question-row").count(),20);
    await page.getByLabel('Go to section').selectOption('9');
    await expect(page.getByRole('button',{name:'Submit Monitoring',exact:true})).toBeEnabled({timeout:30000});
    await expect(page.getByRole('button',{name:/Preview.*PDF/})).toHaveCount(0);
    await page.getByLabel('PDF page',{exact:true}).selectOption('2');await page.getByLabel('PDF zoom',{exact:true}).selectOption('0.75');
    await expect(page.getByRole('button',{name:'Submit Monitoring',exact:true})).toBeEnabled({timeout:30000});
    await page.screenshot({path:resolve(output,`embedded-review-${viewport.width}.png`),fullPage:true});
    assert.equal(complete.status,'draft');
    await page.getByRole('button',{name:'Submit Monitoring',exact:true}).click();
    await expect(page.getByText('This record is read-only until returned or unlocked for correction.',{exact:false})).toBeVisible();
    assert.equal(complete.status,'submitted');
    const download = page.waitForEvent('download');
    await page.getByRole('button',{name:/Download.*PDF/}).click();
    await (await download).saveAs(resolve(output,`browser-completed-${viewport.width}.pdf`));
    assert.deepEqual(await readFile(resolve(output,`browser-completed-${viewport.width}.pdf`)),Buffer.from(documents.get(complete.id),'base64'));
    await page.screenshot({path:resolve(output,`completed-${viewport.width}.png`),fullPage:true});
    complete.status='accepted';complete.locked=true;
    complete.school_year = '2025-26';
    await page.getByRole('button',{name:'Return to Monitorings',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Previous Monitorings',exact:true})).toHaveCount(0);
    await page.getByLabel('School year',{exact:true}).selectOption('2025-26');
    const previous = page.locator('section.sm-card').filter({has:page.getByRole('heading',{name:'Completed / Accepted',exact:true})});
    await previous.getByRole('button',{name:'View',exact:true}).last().click();
    await page.getByRole('button',{name:'View Guided Monitoring',exact:true}).click();
    await expect(page.getByRole('button',{name:'Download Official PDF',exact:true})).toBeVisible();
    await page.getByLabel('Go to section').selectOption('0');
    await expect(page.getByLabel('Monitoring date',{exact:true})).toBeDisabled();
    await pageNav.getByRole('button',{name:'← Monitoring',exact:true}).click();
    await pageNav.getByRole('button',{name:'← Manager Hub',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Manager Tools',exact:true})).toBeVisible();
    await page.getByRole('button',{name:/Manager Resources/}).click();
    await pageNav.getByRole('button',{name:'← Manager Hub',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Manager Tools',exact:true})).toBeVisible();
    await expect(page.getByLabel('4-Digit PIN')).toHaveCount(0);
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  console.log("PASS: desktop/mobile login and Manager Hub, day-specific multi-program times, attendance/zero-week validation, compact menu/questions, legacy draft upgrade, save/resume, mouse/touch signatures, landscape sizing, review, inline special follow-up, preview, submission, byte-identical download, and read-only previous reports.");
  console.log(`Screenshots: ${output}`);
} catch(error) { for(const context of browser.contexts())for(const page of context.pages())console.error((await page.locator('body').innerText()).slice(0,8000));throw error; } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
