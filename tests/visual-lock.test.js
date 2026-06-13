#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const RESULTS_DIR = path.join(ROOT, "test-results", "visual-lock");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "lock-manifest.json"), "utf8"));

function requireRuntimePackage(name) {
  try {
    return require(name);
  } catch (error) {
    throw new Error(
      `Missing runtime package "${name}". Run through ./scripts/run-lock-tests.sh so NODE_PATH includes the Codex bundled runtime, or install ${name} locally.`
    );
  }
}

const { chromium } = requireRuntimePackage("playwright");
const { PNG } = requireRuntimePackage("pngjs");

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  return "application/octet-stream";
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, "http://127.0.0.1");
    const decoded = decodeURIComponent(requestUrl.pathname);
    const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
    const absolutePath = path.resolve(ROOT, relativePath);

    if (!absolutePath.startsWith(ROOT) || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType(absolutePath),
      "Cache-Control": "no-store"
    });
    fs.createReadStream(absolutePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

function parsePng(buffer) {
  return PNG.sync.read(buffer);
}

function assertNonBlankScreenshot(buffer, label) {
  const png = parsePng(buffer);
  let bright = 0;
  let dark = 0;
  let totalLuma = 0;
  let totalLumaSquared = 0;
  const pixels = png.width * png.height;

  for (let offset = 0; offset < png.data.length; offset += 4) {
    const luma = (png.data[offset] + png.data[offset + 1] + png.data[offset + 2]) / 3;
    if (luma > 180) bright += 1;
    if (luma < 18) dark += 1;
    totalLuma += luma;
    totalLumaSquared += luma * luma;
  }

  const mean = totalLuma / pixels;
  const variance = totalLumaSquared / pixels - mean * mean;

  assert.ok(bright > 250, `${label} screenshot has too few bright text/detail pixels: ${bright}`);
  assert.ok(dark > pixels * 0.25, `${label} screenshot no longer has the accepted dark cinematic field`);
  assert.ok(variance > 180, `${label} screenshot looks visually collapsed or blank`);
}

async function visibleTextOverflow(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll([
      "h1",
      "h2",
      "h3",
      "h4",
      ".brand",
      ".nav-cta",
      ".button",
      ".detail-tabs button",
      ".process strong",
      ".benchmark-title strong",
      ".benchmark-metric strong",
      ".benchmark-play"
    ].join(","))];
    return nodes
      .filter((node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        if (style.visibility === "hidden" || style.display === "none" || rect.width <= 0 || rect.height <= 0) return false;
        return node.scrollWidth > Math.ceil(node.clientWidth) + 2;
      })
      .map((node) => ({
        text: (node.textContent || "").trim(),
        className: node.className,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth
      }));
  });
}

async function assertBasePage(page, label) {
  await page.goto(label.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-canvas-ready"), null, { timeout: 5000 });
  await page.waitForTimeout(700);

  await assert.equal(await page.title(), "Omar Protocol | Robotics reliability before action");
  await assert.ok(await page.locator("h1", { hasText: "Omar Protocol" }).isVisible(), `${label.name} hero title is not visible`);
  await assert.ok(await page.locator(".site-header .brand", { hasText: "Omar Protocol" }).isVisible(), `${label.name} brand is not visible`);
  await assert.ok(await page.locator(".nav-cta", { hasText: "Request Access" }).isVisible(), `${label.name} request access CTA is not visible`);

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    activeSections: document.querySelectorAll(".film-section.is-canvas-active").length,
    heroVideos: document.querySelectorAll("[data-hero-video]").length,
    heroImage: document.querySelector(".film-hero [data-motion-image]")?.getAttribute("src") || "",
    canvasReady: document.body.classList.contains("is-canvas-ready")
  }));

  assert.ok(metrics.canvasReady, `${label.name} canvas state did not initialize`);
  assert.equal(metrics.activeSections, 1, `${label.name} should have exactly one active film section`);
  assert.equal(metrics.heroVideos, 3, `${label.name} should preserve three section videos`);
  assert.equal(
    metrics.heroImage,
    "./assets/runway/omar-protocol-satellite-repair-v2-firstframe.jpg",
    `${label.name} main hero drifted away from the orbital repair asset`
  );
  assert.ok(metrics.scrollWidth <= metrics.innerWidth + 1, `${label.name} has horizontal overflow: ${metrics.scrollWidth} > ${metrics.innerWidth}`);

  const overflow = await visibleTextOverflow(page);
  assert.deepEqual(overflow, [], `${label.name} has text overflow: ${JSON.stringify(overflow)}`);

  const screenshot = await page.screenshot({ fullPage: false });
  const outputPath = path.join(RESULTS_DIR, `${label.name}.png`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, screenshot);
  assertNonBlankScreenshot(screenshot, label.name);
}

async function assertDrawer(page, url, labelName) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-canvas-ready"), null, { timeout: 5000 });
  await page.locator(".nav-cta").click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#details").getAttribute("aria-hidden"), "false", `${labelName} drawer did not open`);

  await page.locator('.detail-tabs [data-tab-target="sdk"]').click();
  await page.waitForTimeout(150);

  assert.equal(await page.locator("#drawer-title").textContent(), "SDK wrapper", `${labelName} SDK title drifted`);
  assert.ok(await page.locator('[data-tab-panel="sdk"]').evaluate((node) => node.classList.contains("is-active")), `${labelName} SDK panel is not active`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#details").getAttribute("aria-hidden"), "true", `${labelName} drawer did not close on Escape`);
}

async function assertBenchmarkBoard(page, url, labelName) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-canvas-ready"), null, { timeout: 5000 });

  if (labelName === "desktop") {
    const navLink = page.locator('.nav-links a[href="#benchmarks"]');
    assert.equal(await navLink.count(), 1, "desktop benchmark nav link drifted");
    await navLink.click();
    await page.waitForFunction(() => window.location.hash === "#benchmarks", null, { timeout: 2000 });
  } else {
    await page.goto(`${url}#benchmarks`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("is-canvas-ready"), null, { timeout: 5000 });
  }
  await page.evaluate(() => {
    const section = document.querySelector("#benchmarks");
    const root = document.documentElement;
    const body = document.body;
    root.style.scrollBehavior = "auto";
    body.style.scrollBehavior = "auto";
    const top = section.getBoundingClientRect().top + window.scrollY;
    const scrollingElement = document.scrollingElement || root;
    scrollingElement.scrollTop = top;
    root.scrollTop = top;
    body.scrollTop = top;
    window.scrollTo(0, top);
  });
  await page.waitForFunction(() => Math.abs(document.querySelector("#benchmarks").getBoundingClientRect().top) < 8, null, { timeout: 2000 });
  await page.waitForTimeout(700);

  assert.equal(await page.locator("#benchmarks .benchmark-row").count(), 20, `${labelName} benchmark row count drifted`);
  assert.equal(await page.locator("#benchmarks .benchmark-play").count(), 20, `${labelName} benchmark Play link count drifted`);

  const playHrefs = await page.locator("#benchmarks .benchmark-play").evaluateAll((links) => links.map((link) => link.href));
  assert.deepEqual(new Set(playHrefs), new Set(["https://omaragi.com/run"]), `${labelName} benchmark Play links no longer route to BYOK`);

  const boardMetrics = await page.evaluate(() => {
    const section = document.querySelector("#benchmarks");
    const rows = [...section.querySelectorAll(".benchmark-row")];
    const rect = section.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      sectionTop: rect.top,
      sectionBottom: rect.bottom,
      styledRows: rows.filter((row) => row.style.getPropertyValue("--baseline") && row.style.getPropertyValue("--omar")).length,
      graphTracks: rows.filter((row) => {
        const metric = row.querySelector(".benchmark-metric");
        return metric && getComputedStyle(metric, "::after").backgroundImage !== "none";
      }).length
    };
  });
  assert.ok(boardMetrics.sectionTop < boardMetrics.innerHeight, `${labelName} benchmark board was not reached`);
  assert.equal(boardMetrics.styledRows, 20, `${labelName} benchmark graph variables drifted`);
  assert.equal(boardMetrics.graphTracks, 20, `${labelName} benchmark graph tracks drifted`);
  assert.ok(boardMetrics.scrollWidth <= boardMetrics.innerWidth + 1, `${labelName} benchmark board caused page overflow: ${boardMetrics.scrollWidth} > ${boardMetrics.innerWidth}`);

  const overflow = await visibleTextOverflow(page);
  assert.deepEqual(overflow, [], `${labelName} benchmark board has text overflow: ${JSON.stringify(overflow)}`);

  await page.evaluate(() => {
    const row = document.querySelector('#benchmarks [data-benchmark-name="ManiSkill Robotics"]');
    const top = row.getBoundingClientRect().top + window.scrollY - 96;
    const scrollingElement = document.scrollingElement || document.documentElement;
    scrollingElement.scrollTop = top;
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
    window.scrollTo(0, top);
  });
  await page.waitForFunction(() => {
    const row = document.querySelector('#benchmarks [data-benchmark-name="ManiSkill Robotics"]');
    const rect = row.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  }, null, { timeout: 2000 });
  assert.ok(await page.locator('#benchmarks [data-benchmark-name="ManiSkill Robotics"]').isVisible(), `${labelName} last benchmark row is not reachable`);

  const centeredBenchmark = await page.evaluate(() => {
    const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return center?.closest("#benchmarks .benchmark-row")?.getAttribute("data-benchmark-name") || "";
  });
  assert.ok(centeredBenchmark, `${labelName} benchmark screenshot viewport is not centered on the benchmark board`);

  const screenshot = await page.screenshot({ fullPage: false });
  const outputPath = path.join(RESULTS_DIR, `${labelName}-benchmarks.png`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, screenshot);
  assertNonBlankScreenshot(screenshot, `${labelName}-benchmarks`);
}

async function assertFrameRender(page, frameClass, expectedHeading, labelName) {
  await page.evaluate((targetFrameClass) => {
    const sections = [...document.querySelectorAll(".film-section")];
    const section = document.querySelector(`.${targetFrameClass}`);
    const index = sections.indexOf(section);
    if (!section || index < 0) return;

    const viewport = window.innerHeight || 1;
    const activationLine = viewport * 0.42;
    const lowerBound = section.offsetTop - activationLine + 8;
    const nextSection = sections[index + 1];
    const upperBound = nextSection ? nextSection.offsetTop - activationLine - 8 : lowerBound + viewport;
    const targetY = Math.max(0, (lowerBound + Math.max(lowerBound, upperBound)) / 2);
    window.scrollTo(0, targetY);
  }, frameClass);
  await page.waitForTimeout(700);

  const activeFrame = await page.evaluate(() => {
    const active = document.querySelector(".film-section.is-canvas-active");
    return active ? [...active.classList].find((className) => /^frame-\d{2}$/.test(className)) : "";
  });

  assert.equal(activeFrame, frameClass, `${labelName} did not activate ${frameClass}`);
  assert.ok(await page.locator(`.${frameClass} h2`, { hasText: expectedHeading }).isVisible(), `${labelName} ${frameClass} heading is not visible`);

  const overflow = await visibleTextOverflow(page);
  assert.deepEqual(overflow, [], `${labelName} ${frameClass} has text overflow: ${JSON.stringify(overflow)}`);

  const screenshot = await page.screenshot({ fullPage: false });
  const outputPath = path.join(RESULTS_DIR, `${labelName}-${frameClass}.png`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, screenshot);
  assertNonBlankScreenshot(screenshot, `${labelName}-${frameClass}`);
}

async function assertVideoSourceSelection(page, url, viewportName) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("[data-hero-video]").length === 3, null, { timeout: 5000 });
  await page.waitForTimeout(300);

  const sources = await page.evaluate(() => [...document.querySelectorAll("[data-hero-video]")].map((video) => ({
    local: video.dataset.localSrc || "",
    mobile: video.dataset.mobileSrc || "",
    selected: video.getAttribute("src") || video.currentSrc || "",
    poster: video.getAttribute("poster") || ""
  })));

  assert.equal(sources.length, 3, `${viewportName} video count drifted`);
  for (const source of sources) {
    assert.ok(source.selected, `${viewportName} video source was not selected for ${source.local}`);
    assert.ok(source.poster, `${viewportName} video poster was not selected for ${source.local}`);
  }

  if (viewportName === "mobile") {
    const mobileSelected = sources.filter((source) => source.mobile).map((source) => source.selected);
    assert.deepEqual(mobileSelected, [
      "./assets/runway/omar-protocol-frame03-outlive-v3-cable-lock-gen45-10s-mobile-safari.mp4",
      "./assets/runway/omar-protocol-satellite-repair-v2-10s-mobile-safari.mp4",
      "./assets/runway/omar-protocol-frame06-runway-v8-gen45-10s-mobile-safari.mp4"
    ]);
  }
}

(async () => {
  const { server, url } = await startStaticServer();
  let browser = null;
  const pageErrors = [];

  try {
    browser = await chromium.launch({ headless: true });

    for (const [name, viewport] of Object.entries(manifest.viewports)) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor || 1,
        isMobile: !!viewport.isMobile,
        hasTouch: !!viewport.hasTouch,
        reducedMotion: "no-preference"
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => pageErrors.push(`${name}: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") pageErrors.push(`${name}: console error: ${message.text()}`);
      });

      await assertBasePage(page, { name, url });
      await assertVideoSourceSelection(page, url, name);
      await assertFrameRender(page, "frame-04", "Validate before motion.", name);
      await assertDrawer(page, url, name);
      await assertBenchmarkBoard(page, url, name);
      await context.close();
    }

    assert.deepEqual(pageErrors, [], `browser errors appeared: ${pageErrors.join("; ")}`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
