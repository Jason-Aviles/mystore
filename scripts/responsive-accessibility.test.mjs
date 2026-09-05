import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4174;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let server;
let browser;

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(ORIGIN);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Vite did not start within 30 seconds');
}

async function phonePage({ reducedMotion = 'no-preference', viewport = { width: 390, height: 844 } } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion,
  });
  await context.addInitScript(() => {
    localStorage.setItem('dd_access', JSON.stringify(1));
    sessionStorage.setItem('dd_loaded', '1');
  });
  const page = await context.newPage();
  return { context, page };
}

before(async () => {
  server = spawn(process.execPath, [
    'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT),
  ], {
    cwd: process.cwd(),
    stdio: 'ignore',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  });
  await waitForServer();
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    if (!String(error).includes("Executable doesn't exist")) throw error;
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
  }
});

after(async () => {
  await browser?.close();
  server?.kill();
});

test('the access gate exposes a named modal and announces validation errors', async () => {
  const { context, page } = await phonePage();
  await page.goto(`${ORIGIN}/?gate`, { waitUntil: 'networkidle' });

  const dialog = page.locator('.gate');
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  const labelledBy = await dialog.getAttribute('aria-labelledby');
  assert.ok(labelledBy, 'dialog must be labelled by its visible heading');
  assert.equal(await page.locator(`#${labelledBy}`).count(), 1);
  assert.equal(await page.locator('.gate .err').getAttribute('aria-live'), 'polite');

  await context.close();
});

test('the access image preserves its upper focal area on a phone', async () => {
  const { context, page } = await phonePage();
  await page.goto(`${ORIGIN}/?gate`, { waitUntil: 'networkidle' });
  const image = page.locator('.gate-tease img');
  await image.waitFor();

  const focalY = await image.evaluate((element) => {
    const value = getComputedStyle(element).objectPosition.split(/\s+/)[1] || '50%';
    return Number.parseFloat(value);
  });
  assert.ok(focalY <= 30, `phone crop must favor the subject's head; received ${focalY}%`);

  await page.locator('.gate').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const finalAction = page.getByRole('button', { name: /browse as guest/i });
  assert.ok(await finalAction.isVisible(), 'the final access action must remain reachable');

  await context.close();
});

test('the phone header and page content do not overflow horizontally', async () => {
  const { context, page } = await phonePage();
  await page.goto(`${ORIGIN}/shop`, { waitUntil: 'networkidle' });

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    actionRight: document.querySelector('.head-actions')?.getBoundingClientRect().right ?? 0,
  }));
  assert.equal(layout.documentWidth, layout.viewport);
  assert.ok(layout.actionRight <= layout.viewport, `header actions end at ${layout.actionRight}px`);

  await context.close();
});

test('the desktop product film keeps its frames layered and its copy readable', async () => {
  const { context, page } = await phonePage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`${ORIGIN}/product/city-of-sins-blood-heat-bundle`, { waitUntil: 'networkidle' });

  const layout = await page.locator('.pstory').evaluate((story) => {
    const frame = story.querySelector('.ps-frame');
    const copy = story.querySelector('.ps-copy');
    return {
      framePosition: getComputedStyle(frame).position,
      frameWidth: frame.getBoundingClientRect().width,
      copyWidth: copy.getBoundingClientRect().width,
      frameLeft: frame.getBoundingClientRect().left,
      copyRight: copy.getBoundingClientRect().right,
    };
  });

  assert.equal(layout.framePosition, 'absolute');
  assert.ok(layout.frameWidth < 1200, `film frame must respect its side insets; received ${layout.frameWidth}px`);
  assert.ok(layout.copyWidth >= 280, `film copy collapsed to ${layout.copyWidth}px`);
  assert.ok(layout.copyRight <= layout.frameLeft, `film copy overlaps the image by ${layout.copyRight - layout.frameLeft}px`);

  await context.close();
});

test('the scroll-driven product film is removed when reduced motion is requested', async () => {
  const { context, page } = await phonePage({
    reducedMotion: 'reduce',
    viewport: { width: 1200, height: 900 },
  });
  await page.goto(`${ORIGIN}/product/city-of-sins-blood-heat-bundle`, { waitUntil: 'networkidle' });

  assert.equal(await page.locator('.pstory').evaluate((story) => getComputedStyle(story).display), 'none');

  await context.close();
});

test('the phone cinematic transition keeps the second video visually substantial', async () => {
  const { context, page } = await phonePage();
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.25));
  await page.waitForTimeout(900);

  const frame = await page.locator('.hs-monolith').boundingBox();
  assert.ok(frame, 'second hero frame must be rendered');
  assert.ok(frame.width >= 390 * 0.78, `second hero frame is only ${Math.round(frame.width)}px wide`);
  assert.ok(frame.height >= 844 * 0.52, `second hero frame is only ${Math.round(frame.height)}px tall`);
  const coveredWidth = await page.locator('.hs-slat').evaluateAll((slats) => {
    const middle = window.innerHeight / 2;
    return slats.reduce((total, slat) => {
      const style = getComputedStyle(slat);
      const rect = slat.getBoundingClientRect();
      const coversMiddle = style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity) > 0 && rect.top <= middle && rect.bottom >= middle;
      return total + (coversMiddle ? rect.width : 0);
    }, 0);
  });
  assert.ok(coveredWidth <= 390 * 0.25, `hero shutters obscure ${Math.round(coveredWidth)}px of the phone frame`);

  await context.close();
});

test('the tablet cinematic transition also fills the available frame', async () => {
  const viewport = { width: 768, height: 1024 };
  const { context, page } = await phonePage({ viewport });
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.25));
  await page.waitForTimeout(900);

  const frame = await page.locator('.hs-monolith').boundingBox();
  assert.ok(frame, 'tablet hero frame must be rendered');
  assert.ok(frame.width >= viewport.width * 0.78, `tablet hero frame is only ${Math.round(frame.width)}px wide`);
  assert.ok(frame.height >= viewport.height * 0.52, `tablet hero frame is only ${Math.round(frame.height)}px tall`);

  await context.close();
});

test('public pages provide a keyboard skip link to the main content', async () => {
  const { context, page } = await phonePage();
  await page.goto(`${ORIGIN}/about`, { waitUntil: 'networkidle' });
  const skip = page.getByRole('link', { name: /skip to main content/i });
  assert.equal(await skip.getAttribute('href'), '#main-content');
  assert.equal(await page.locator('main#main-content').count(), 1);
  await context.close();
});

test('autoplaying decorative media stays paused when reduced motion is requested', async () => {
  const { context, page } = await phonePage({ reducedMotion: 'reduce' });
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  const playing = await page.locator('video[autoplay], video[autoPlay]').evaluateAll((videos) => (
    videos.filter((video) => !video.paused).length
  ));
  assert.equal(playing, 0);
  await context.close();
});

test('representative public pages keep semantic media, headings, and form controls', async () => {
  const routes = [
    '/', '/shop', '/drop', '/product/city-of-sins-blood-heat-bundle',
    '/about', '/contact', '/cart', '/size-guide', '/shipping', '/refunds', '/privacy',
  ];
  const { context, page } = await phonePage({ reducedMotion: 'reduce' });
  const failures = [];

  for (const route of routes) {
    await page.goto(`${ORIGIN}${route}`, { waitUntil: 'networkidle' });
    const result = await page.evaluate(() => {
      const unnamedControls = [...document.querySelectorAll('input, select, textarea')]
        .filter((control) => control.type !== 'hidden')
        .filter((control) => !control.getAttribute('name'))
        .map((control) => control.outerHTML.slice(0, 100));
      const inaccessibleControls = [...document.querySelectorAll('input, select, textarea')]
        .filter((control) => control.type !== 'hidden')
        .filter((control) => !control.getAttribute('aria-label') && !control.labels?.length)
        .map((control) => control.outerHTML.slice(0, 100));
      return {
        missingAlt: document.querySelectorAll('img:not([alt])').length,
        h1Count: document.querySelectorAll('h1').length,
        unnamedControls,
        inaccessibleControls,
      };
    });
    if (result.missingAlt) failures.push(`${route}: ${result.missingAlt} image(s) missing alt`);
    if (result.h1Count !== 1) failures.push(`${route}: expected 1 h1, received ${result.h1Count}`);
    if (result.unnamedControls.length) failures.push(`${route}: unnamed controls ${result.unnamedControls.join(' | ')}`);
    if (result.inaccessibleControls.length) failures.push(`${route}: inaccessible controls ${result.inaccessibleControls.join(' | ')}`);
  }

  assert.deepEqual(failures, []);
  await context.close();
});

test('keyboard focus remains visibly outlined on form fields', async () => {
  const { context, page } = await phonePage({ reducedMotion: 'reduce' });
  await page.goto(`${ORIGIN}/contact`, { waitUntil: 'networkidle' });
  const input = page.locator('input[name="order-number"]');
  await input.focus();
  const outline = await input.evaluate((element) => getComputedStyle(element).outlineStyle);
  assert.notEqual(outline, 'none');
  await context.close();
});

test('search and review interfaces give every form control a stable name', async () => {
  const { context, page } = await phonePage({ reducedMotion: 'reduce' });
  await page.goto(`${ORIGIN}/shop`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Search' }).click();
  assert.equal(await page.locator('.search-overlay input').getAttribute('name'), 'search');

  await page.goto(`${ORIGIN}/product/city-of-sins-blood-heat-bundle`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /write a review/i }).click();
  const unnamed = await page.locator('.review-form input, .review-form select, .review-form textarea').evaluateAll((controls) => (
    controls.filter((control) => !control.getAttribute('name')).map((control) => control.outerHTML.slice(0, 100))
  ));
  assert.deepEqual(unnamed, []);
  await context.close();
});
