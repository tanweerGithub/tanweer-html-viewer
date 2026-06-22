import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resumeHtml = readFileSync(join(__dirname, '../public/samples/sdet-resume.html'), 'utf8');
const baseUrl = process.env.TEST_URL || 'http://localhost:5175/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.setViewportSize({ width: 1400, height: 700 });

// Load resume HTML into editor
await page.evaluate((html) => {
  window.__setEditorHtml?.(html);
}, resumeHtml);

await page.waitForTimeout(600);

// Enable inspect
await page.click('#inspect-toggle');
await page.waitForTimeout(400);

const diag = await page.evaluate(() => {
  const frame = document.getElementById('preview-frame');
  const doc = frame?.contentDocument;
  const indexed = doc?.querySelectorAll('[data-thv-path]').length ?? 0;
  const overlay = doc?.getElementById('thv-overlay-root');
  const h1 = doc?.querySelector('h1');
  const h1Path = h1?.getAttribute('data-thv-path');
  return {
    indexed,
    hasOverlay: !!overlay,
    h1Path,
    inspectOn: document.getElementById('inspect-toggle')?.classList.contains('is-active'),
  };
});

console.log('Diagnostics:', diag);

// Hover over code — skills section line
const skillsLine = await page.locator('.cm-line').filter({ hasText: 'id="skills"' }).first();
const skillsBox = await skillsLine.boundingBox();
const hoverX = skillsBox ? skillsBox.x + 30 : 0;
const hoverY = skillsBox ? skillsBox.y + skillsBox.height / 2 : 0;
if (skillsBox) {
  await page.locator('.cm-line').filter({ hasText: 'id="skills"' }).first().hover();
  await page.waitForTimeout(350);
}

const afterHover = await page.evaluate(({ hx, hy }) => {
  const frame = document.getElementById('preview-frame');
  const doc = frame?.contentDocument;
  const hoverOverlay = doc?.querySelector('.thv-overlay-box.is-hover');
  const codeHover = document.querySelector('.cm-thv-hover');
  const debug = window.__inspect?.debugAtClientCoords?.(hx, hy);
  return {
    previewHover: !!hoverOverlay,
    codeHover: !!codeHover,
    overlayRect: hoverOverlay ? {
      w: hoverOverlay.offsetWidth,
      h: hoverOverlay.offsetHeight,
    } : null,
    debug,
  };
}, { hx: hoverX, hy: hoverY });

console.log('After code hover:', afterHover);

// Click h1 in preview
if (diag.h1Path != null) {
  const clicked = await page.evaluate((path) => {
    const frame = document.getElementById('preview-frame');
    const doc = frame?.contentDocument;
    const el = doc?.querySelector(`[data-thv-path="${path}"]`);
    if (!el) return { ok: false, reason: 'no el' };
    const rect = el.getBoundingClientRect();
    return { ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, diag.h1Path);

  if (clicked.ok) {
    const frameEl = await page.$('#preview-frame');
    const fbox = await frameEl.boundingBox();
    await page.mouse.click(fbox.x + clicked.x, fbox.y + clicked.y);
    await page.waitForTimeout(500);
  }

  const afterClick = await page.evaluate(() => {
    const frame = document.getElementById('preview-frame');
    const doc = frame?.contentDocument;
    const selectedOverlay = doc?.querySelector('.thv-overlay-box.is-selected');
    const drawerOpen = document.getElementById('selection-drawer')?.classList.contains('is-open');
    const scrollY = frame?.contentWindow?.scrollY ?? 0;
    return { selectedOverlay: !!selectedOverlay, drawerOpen, scrollY };
  });

  console.log('After preview click h1:', afterClick);
}

// Click projects section in code — should scroll preview
const projectsLine = await page.locator('.cm-line').filter({ hasText: 'id="projects"' }).first();
const projBox = await projectsLine.boundingBox();
if (projBox) {
  await page.locator('.cm-line').filter({ hasText: 'id="projects"' }).first().click();
  await page.waitForTimeout(1200);
}

const afterProjectClick = await page.evaluate(() => {
  const frame = document.getElementById('preview-frame');
  const doc = frame?.contentDocument;
  const section = doc?.getElementById('projects');
  const rect = section?.getBoundingClientRect();
  const fh = frame?.contentWindow?.innerHeight ?? 0;
  const centered = rect ? Math.abs(rect.top + rect.height / 2 - fh / 2) < fh * 0.35 : false;
  return {
    selectedOverlay: !!doc?.querySelector('.thv-overlay-box.is-selected'),
    scrollY: frame?.contentWindow?.scrollY ?? 0,
    centered,
  };
});

console.log('After code click projects:', afterProjectClick);

if (logs.length) console.log('Console:', logs.slice(0, 10));

await browser.close();

const pass =
  diag.indexed > 10 &&
  afterHover.codeHover &&
  afterHover.previewHover &&
  afterHover.overlayRect?.h > 0 &&
  afterProjectClick.selectedOverlay &&
  afterProjectClick.centered;

console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);