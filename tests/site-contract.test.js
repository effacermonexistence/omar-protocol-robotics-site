#!/usr/bin/env node
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const manifest = readJson("tests/lock-manifest.json");
const packageJson = readJson("package.json");
const html = readText("index.html");
const css = readText("styles.css");
const js = readText("script.js");
const server = readText("server.js");
const railwayServer = readText("server.mjs");

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256(relativePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(ROOT, relativePath)))
    .digest("hex");
}

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label || "source"} is missing locked text: ${needle}`);
}

function assetReferences() {
  const refs = new Set();
  const patterns = [
    /(?:src|poster|href)="\.\/(assets\/[^"]+)"/g,
    /data-[a-z-]+="\.\/(assets\/[^"]+)"/g,
    /url\(["']?\.\/(assets\/[^"')]+)["']?\)/g
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) refs.add(match[1]);
    for (const match of css.matchAll(pattern)) refs.add(match[1]);
  }

  return [...refs].sort();
}

function videoBlocks() {
  return [...html.matchAll(/<video\b[\s\S]*?<\/video>/g)].map((match) => match[0]);
}

test("accepted file and hero asset hashes stay locked", () => {
  const locked = {
    ...manifest.lockedFiles,
    ...manifest.lockedHeroAssets
  };

  for (const [relativePath, expectedHash] of Object.entries(locked)) {
    assert.equal(
      sha256(relativePath),
      expectedHash,
      `${relativePath} drifted from the Ben-accepted lock. If this is intentional, update tests/lock-manifest.json in the same patch.`
    );
  }
});

test("all local assets referenced by the page exist and are non-empty", () => {
  const refs = assetReferences();
  assert.ok(refs.length >= 10, "expected locked local visual/video assets to be referenced");

  for (const relativePath of refs) {
    const absolutePath = path.join(ROOT, relativePath);
    assert.ok(fs.existsSync(absolutePath), `missing local asset: ${relativePath}`);
    assert.ok(fs.statSync(absolutePath).size > 0, `empty local asset: ${relativePath}`);
  }
});

test("page identity, accepted copy, and detail tabs stay intact", () => {
  assertIncludes(html, "<title>Omar Protocol | Robotics reliability before action</title>", "index.html");
  assertIncludes(html, 'content="Omar Protocol is a reliability protocol before robot-agent action:', "index.html");

  for (const lockedCopy of manifest.lockedCopy) {
    assertIncludes(html, lockedCopy, "index.html");
  }

  for (const tab of manifest.lockedTabs) {
    assertIncludes(html, `data-tab-target="${tab}"`, "detail tabs");
    assertIncludes(html, `data-tab-panel="${tab}"`, "detail panels");
  }

  assertIncludes(js, "Robotics reliability", "script.js");
  assertIncludes(js, "SDK wrapper", "script.js");
  assertIncludes(js, "Request access", "script.js");
});

test("Benchmarks scrolls to the landing graph board and every Play routes to OmarAGI BYOK", () => {
  assertIncludes(html, '<a href="#benchmarks">Benchmarks</a>', "benchmark nav link");
  assert.equal(html.includes('<a href="#details" data-detail-target="benchmarks">Benchmarks</a>'), false, "top-level Benchmarks must scroll to the landing graph board");
  assertIncludes(html, '<section class="benchmark-field" id="benchmarks"', "landing benchmark section");
  assertIncludes(html, '<div class="benchmark-board" data-benchmark-board', "benchmark board");
  assertIncludes(html, '<a class="button benchmark-board-action" href="https://omaragi.com/run">Open BYOK Replay</a>', "benchmark drawer link");

  const benchmarkRows = [...html.matchAll(/<li class="benchmark-row" data-benchmark-name="([^"]+)" style="--baseline: [^"]+; --omar: [^"]+;">/g)].map((match) => match[1]);
  assert.deepEqual(benchmarkRows, [
    "HLE / HLE-Verified",
    "BBEH",
    "SimpleQA Verified / VSF",
    "BBH",
    "MuSR",
    "BIPIA",
    "HaluEval",
    "TruthfulQA",
    "AgentDojo",
    "HorizonMath",
    "AIME 120",
    "GPQA",
    "MMLU-Pro",
    "SimpleQA",
    "Facts Grounding",
    "HealthBench hard",
    "HealthBench main",
    "HealthBench consensus",
    "RoboBench Embodied QA",
    "ManiSkill Robotics"
  ]);

  const playLinks = [...html.matchAll(/<a class="benchmark-play" href="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(playLinks.length, 20, "expected one BYOK Play link for each benchmark row");
  assert.deepEqual(new Set(playLinks), new Set(["https://omaragi.com/run"]));
});

test("Railway static server entrypoint preserves Range-capable asset delivery", () => {
  assert.equal(packageJson.scripts.start, "node server.js", "Railway must have a stable start command");
  assertIncludes(railwayServer, 'import "./server.js";', "server.mjs");
  assertIncludes(server, "http.createServer", "server.js");
  assertIncludes(server, "Accept-Ranges", "server.js");
  assertIncludes(server, "Content-Range", "server.js");
  assertIncludes(server, "process.env.PORT", "server.js");
  assertIncludes(server, "index.html", "server.js");
});

test("Validate before motion frame uses the non-human mechanical mask asset", () => {
  const acceptedAsset = "./assets/generated/omar-protocol-validate-companion-open-rig-no-brow-v14-720x1280.png";
  const rejectedAsset = "./assets/generated/omar-protocol-validate-companion-pelvis-no-brow-v13-720x1280.png";

  assertIncludes(html, acceptedAsset, "frame-04 source");
  assert.equal(html.includes(rejectedAsset), false, "frame-04 must not reference the rejected humanoid-face asset");
});

test("main hero uses the orbital satellite repair design family", () => {
  const acceptedAsset = "./assets/runway/omar-protocol-satellite-repair-v2-firstframe.jpg";
  const rejectedPoster = "./assets/runway/omar-protocol-selected-pass1-firstframe.png";
  const rejectedVideo = "./assets/runway/omar-protocol-selected-pass1.mp4";

  assertIncludes(html, acceptedAsset, "frame-01 source");
  assert.equal(html.includes(rejectedPoster), false, "main hero must not reference the old indoor lab robot poster");
  assert.equal(html.includes(rejectedVideo), false, "main hero must not reference the old indoor lab robot video");
});

test("film frame count and order stay locked", () => {
  const frameMatches = [...html.matchAll(/<section class="[^"]*\bfilm-section\b[^"]*\b(frame-\d{2})\b[^"]*"/g)]
    .map((match) => match[1]);

  assert.deepEqual(frameMatches, manifest.lockedFrames);
  assert.equal((html.match(/\bfilm-section\b/g) || []).length, 6);
});

test("video contract preserves autoplay, inline mobile playback, posters, and mobile Safari sources", () => {
  const blocks = videoBlocks();
  assert.equal(blocks.length, 3, "expected exactly three locked section videos after the main hero became an orbital repair still");

  for (const block of blocks) {
    for (const attribute of [
      "data-hero-video",
      "autoplay",
      "muted",
      "loop",
      "playsinline",
      "webkit-playsinline",
      'preload="auto"',
      'crossorigin="anonymous"',
      "disablepictureinpicture",
      'controlslist="nodownload noplaybackrate noremoteplayback"',
      'x-webkit-airplay="deny"'
    ]) {
      assertIncludes(block, attribute, "video block");
    }
  }

  const mobileSources = [...html.matchAll(/<source src="([^"]*mobile-safari\.mp4)" type="video\/mp4" media="\(max-width: 760px\)" \/>/g)]
    .map((match) => match[1]);

  assert.deepEqual(mobileSources, [
    "./assets/runway/omar-protocol-frame03-outlive-v3-cable-lock-gen45-10s-mobile-safari.mp4",
    "./assets/runway/omar-protocol-satellite-repair-v2-10s-mobile-safari.mp4",
    "./assets/runway/omar-protocol-frame06-runway-v8-gen45-10s-mobile-safari.mp4"
  ]);

  assertIncludes(js, 'window.matchMedia("(max-width: 760px), (pointer: coarse)")', "mobile source selector");
  assertIncludes(js, "const selectedMobileSrc = mobilePlaybackQuery.matches ? video.dataset.mobileSrc : \"\";", "mobile source selector");
  assertIncludes(js, "requestActiveHeroVideoPlayback", "mobile playback repair");
  assertIncludes(js, "}, 1400);", "mobile playback watchdog");
});

test("desktop/mobile layout locks remain in CSS", () => {
  const lockedCss = [
    ".film-section {\n  position: relative;",
    "min-height: 270svh;",
    ".film-section + .film-section {\n  margin-top: -152svh;",
    ".film-hero {\n  min-height: 282svh;",
    "@media (max-width: 980px)",
    "@media (max-width: 640px)",
    ".film-hero {\n    min-height: 244dvh;",
    ".film-section {\n    min-height: 232dvh;",
    ".film-section + .film-section { margin-top: -118dvh; }",
    ".frame-copy {\n    position: fixed;",
    "body.is-canvas-ready .film-section.is-canvas-active .frame-copy",
    ".drawer-panel { width: 100vw;"
  ];

  for (const needle of lockedCss) {
    assertIncludes(css, needle, "styles.css");
  }
});

test("drawer and canvas behavior contracts remain in script", () => {
  const lockedScript = [
    'drawer.setAttribute("aria-hidden", "false");',
    'document.body.classList.add("drawer-open");',
    'drawer.setAttribute("aria-hidden", "true");',
    'const activeSection = document.querySelector(".film-section.is-canvas-active") || document.querySelector(".film-hero");',
    'document.body.classList.add("is-canvas-ready");',
    'section.classList.toggle("is-canvas-active", section === activeSection);',
    'window.addEventListener("scroll", requestCanvasSections, { passive: true });',
    'if (event.key === "Escape") closeDetails();'
  ];

  for (const needle of lockedScript) {
    assertIncludes(js, needle, "script.js");
  }
});
