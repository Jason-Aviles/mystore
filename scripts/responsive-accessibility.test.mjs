import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

async function desktopPage({ reducedMotion = 'no-preference', viewport = { width: 1200, height: 900 } } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    reducedMotion,
  });
  await context.addInitScript(() => {
    localStorage.setItem('dd_access', JSON.stringify(1));
    sessionStorage.setItem('dd_loaded', '1');
  });
  const page = await context.newPage();
  return { context, page };
}

async function navigateToBundle(page) {
  await page.goto(`${ORIGIN}/shop`, { waitUntil: 'networkidle' });
  await page.locator('a[href="/product/city-of-sins-blood-heat-bundle"]').first().click();
  await page.waitForURL('**/product/city-of-sins-blood-heat-bundle');
  await page.locator('.pstory').waitFor({ state: 'attached' });
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

test('the ultrawide header tucks away and returns as one complete unit', async () => {
  const { context, page } = await desktopPage({ viewport: { width: 3815, height: 785 } });
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.scroll-progress')?.style.transform);

  const visible = await page.locator('.site-top').evaluate((top) => {
    const topRect = top.getBoundingClientRect();
    const announcementRect = top.querySelector('.annc').getBoundingClientRect();
    const headerRect = top.querySelector('.site-header').getBoundingClientRect();
    return {
      top: topRect.top,
      bottom: topRect.bottom,
      announcementBottom: announcementRect.bottom,
      headerTop: headerRect.top,
      inert: top.inert,
    };
  });
  assert.ok(Math.abs(visible.top) < 1);
  assert.ok(visible.bottom > 0);
  assert.ok(visible.headerTop >= visible.announcementBottom - 1);
  assert.equal(visible.inert, false);

  await page.mouse.wheel(0, 1400);
  await page.waitForFunction(() => {
    const top = document.querySelector('.site-top');
    return top?.inert && top.getBoundingClientRect().bottom <= 0;
  }, undefined, { timeout: 3000 });
  const hidden = await page.locator('.site-top').evaluate((top) => ({
    bottom: top.getBoundingClientRect().bottom,
    inert: top.inert,
  }));
  assert.ok(hidden.bottom <= 0, `hidden header still ends at ${hidden.bottom}px`);
  assert.equal(hidden.inert, true);
  await page.screenshot({ path: join(tmpdir(), 'darkdivine-header-ultrawide-hidden.png') });

  await page.mouse.wheel(0, -160);
  await page.waitForFunction(() => {
    const top = document.querySelector('.site-top');
    return !top?.inert && Math.abs(top.getBoundingClientRect().top) < 1;
  }, undefined, { timeout: 3000 });
  const returned = await page.locator('.site-top').evaluate((top) => ({
    top: top.getBoundingClientRect().top,
    inert: top.inert,
  }));
  assert.ok(Math.abs(returned.top) < 1);
  assert.equal(returned.inert, false);

  await page.screenshot({ path: join(tmpdir(), 'darkdivine-header-ultrawide-returned.png') });
  await context.close();
});

test('client navigation renders a non-overlapping editorial product story at 1004px', async () => {
  const { context, page } = await desktopPage({ viewport: { width: 1004, height: 847 } });
  await navigateToBundle(page);
  await page.locator('.ps-line h2').evaluate((heading) => {
    heading.textContent = 'Blood Heat Bundle Extended Editorial Edition';
    heading.closest('.ps-copy').querySelector('[data-ps="1"] p').textContent =
      'Jersey runs true with a relaxed athletic cut. Pants use a relaxed straight leg with an adjustable drawstring waist and a deliberately long fit description that must wrap safely.';
  });

  const layout = await page.locator('.pstory').evaluate((story) => {
    const shown = (element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    };
    const intersects = (a, b) => (
      a.left < b.right - 1 && a.right > b.left + 1
      && a.top < b.bottom - 1 && a.bottom > b.top + 1
    );
    const lines = [...story.querySelectorAll('.ps-line')];
    const lineRects = lines.map((line) => line.getBoundingClientRect());
    const heading = story.querySelector('.ps-line h2');
    const headingText = heading.firstChild;
    const headingWords = [...headingText.textContent.matchAll(/\S+/g)];
    const button = story.querySelector('.ps-action, .ps-line button');
    const buttonParts = [...button.querySelectorAll('.ps-action-part')];
    const text = [...story.querySelectorAll('.ps-line h2, .ps-line p')];
    const visibleFrames = [...story.querySelectorAll('.ps-frame')].filter(shown);
    return {
      enhanced: story.classList.contains('is-enhanced'),
      pinned: story.parentElement.classList.contains('pin-spacer'),
      currentSteps: story.querySelectorAll('.ps-step[aria-current="step"]').length,
      linePositions: lines.map((line) => getComputedStyle(line).position),
      readableLines: lines.every(shown),
      brokenHeadingWords: headingWords.some((word) => {
        const range = document.createRange();
        range.setStart(headingText, word.index);
        range.setEnd(headingText, word.index + word[0].length);
        return range.getClientRects().length > 1;
      }),
      lineOverlap: lineRects.some((rect, i) => lineRects.slice(i + 1).some((other) => intersects(rect, other))),
      buttonOverlap: text.some((node) => intersects(node.getBoundingClientRect(), button.getBoundingClientRect())),
      intactButtonParts: buttonParts.length === 2
        && buttonParts.every((part) => part.getClientRects().length === 1),
      visibleFrames: visibleFrames.length,
      copyRight: story.querySelector('.ps-copy').getBoundingClientRect().right,
      frameLeft: visibleFrames[0].getBoundingClientRect().left,
      buttonVisible: shown(button) && button.getBoundingClientRect().height >= 44,
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });

  assert.equal(layout.enhanced, false);
  assert.equal(layout.pinned, false);
  assert.equal(layout.currentSteps, 0);
  assert.ok(layout.linePositions.every((position) => position !== 'absolute'));
  assert.equal(layout.readableLines, true);
  assert.equal(layout.brokenHeadingWords, false);
  assert.equal(layout.lineOverlap, false);
  assert.equal(layout.buttonOverlap, false);
  assert.equal(layout.intactButtonParts, true);
  assert.equal(layout.visibleFrames, 1);
  assert.ok(layout.copyRight <= layout.frameLeft, 'editorial copy must stay clear of the product image');
  assert.equal(layout.buttonVisible, true);
  assert.equal(layout.documentWidth, layout.viewport);
  await page.locator('.pstory').evaluate((story) => {
    story.querySelector('.ps-line h2').textContent = 'Blood Heat Bundle';
    story.querySelector('[data-ps="1"] p').textContent =
      'Jersey runs true with a relaxed athletic cut. Pants are a relaxed straight leg with adjustable drawstring waist \u2014 size down for a tapered stack.';
  });
  await page.locator('.pstory').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(tmpdir(), 'darkdivine-product-story-1004.png') });

  await context.close();
});

test('client navigation initializes one scoped cinematic on wide desktops', async () => {
  const { context, page } = await desktopPage();
  await navigateToBundle(page);
  await page.locator('.pstory.is-enhanced').waitFor();

  const state = await page.locator('.pstory').evaluate((story) => ({
    pinned: story.parentElement.classList.contains('pin-spacer'),
    enhancedStories: document.querySelectorAll('.pstory.is-enhanced').length,
    storyTriggers: window.__ddProductStoryTriggerCount?.() ?? -1,
    progressRails: story.querySelectorAll('.ps-progress').length,
    progressSteps: story.querySelectorAll('.ps-step').length,
    framePositions: [...story.querySelectorAll('.ps-frame')].map((frame) => getComputedStyle(frame).position),
  }));
  assert.equal(state.pinned, true);
  assert.equal(state.enhancedStories, 1);
  assert.equal(state.storyTriggers, 1);
  assert.equal(state.progressRails, 1);
  assert.equal(state.progressSteps, 3);
  assert.ok(state.framePositions.every((position) => position === 'absolute'));

  const spacerTop = await page.locator('.pstory').evaluate((story) => (
    story.parentElement.getBoundingClientRect().top + window.scrollY
  ));
  const checkpoints = [0.14, 0.48, 0.82];
  const expectedActs = ['Piece', 'Cut', 'Run'];
  for (const [index, progress] of checkpoints.entries()) {
    await page.evaluate(({ top, progress: point }) => window.scrollTo(0, top + (window.innerHeight * 2.5 * point)), { top: spacerTop, progress });
    await page.waitForFunction(() => (
      Math.abs(document.querySelector('.pstory')?.getBoundingClientRect().top ?? 999) < 2
    ));
    await page.waitForFunction((expectedAct) => (
      document.querySelector('.ps-step[aria-current="step"]')?.textContent.trim() === expectedAct
    ), expectedActs[index]);
    const captionState = await page.locator('.ps-line').evaluateAll((lines) => lines.map((line) => ({
      visible: Number(getComputedStyle(line).opacity) > 0.5,
      pointerEvents: getComputedStyle(line).pointerEvents,
    })));
    const visible = captionState.filter((line) => line.visible);
    const settledFrames = await page.locator('.ps-frame').evaluateAll((frames) => frames
      .map((frame, frameIndex) => ({ frameIndex, opacity: Number(getComputedStyle(frame).opacity) }))
      .filter((frame) => frame.opacity > 0.01));
    const activeStep = await page.locator('.ps-step[aria-current="step"]').textContent();
    assert.equal(visible.length, 1, `expected one caption at cinematic progress ${progress}, received ${visible.length}`);
    assert.equal(visible[0].pointerEvents, 'auto');
    assert.ok(captionState.filter((line) => !line.visible).every((line) => line.pointerEvents === 'none'));
    assert.equal(activeStep.trim(), expectedActs[index]);
    assert.deepEqual(settledFrames.map((frame) => frame.frameIndex), [index]);
    await page.screenshot({
      path: join(tmpdir(), `darkdivine-product-story-1200-${expectedActs[index].toLowerCase()}.png`),
    });
  }
  await page.evaluate((top) => window.scrollTo(0, top + (window.innerHeight * 2.5 * 0.98)), spacerTop);
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(tmpdir(), 'darkdivine-product-story-1200.png') });

  await context.close();
});

test('the product cinematic remounts cleanly through browser back and forward navigation', async () => {
  const { context, page } = await desktopPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await navigateToBundle(page);
  await page.locator('.pstory.is-enhanced').waitFor();

  await page.goBack({ waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/shop');
  assert.equal(await page.locator('.pstory').count(), 0);
  assert.equal(await page.locator('.pin-spacer .pstory').count(), 0);
  assert.equal(await page.evaluate(() => window.__ddProductStoryTriggerCount?.() ?? -1), 0);

  await page.goForward({ waitUntil: 'networkidle' });
  await page.locator('.pstory.is-enhanced').waitFor();
  assert.equal(await page.locator('.pstory.is-enhanced').count(), 1);
  assert.equal(await page.locator('.pstory').evaluate((story) => story.parentElement.classList.contains('pin-spacer')), true);
  assert.equal(await page.evaluate(() => window.__ddProductStoryTriggerCount?.() ?? -1), 1);
  assert.deepEqual(pageErrors, []);

  await context.close();
});

test('reduced motion keeps the desktop product story readable without pinning', async () => {
  const { context, page } = await desktopPage({
    reducedMotion: 'reduce',
    viewport: { width: 1200, height: 900 },
  });
  await page.goto(`${ORIGIN}/product/city-of-sins-blood-heat-bundle`, { waitUntil: 'networkidle' });

  const state = await page.locator('.pstory').evaluate((story) => ({
    display: getComputedStyle(story).display,
    enhanced: story.classList.contains('is-enhanced'),
    pinned: story.parentElement.classList.contains('pin-spacer'),
    linePositions: [...story.querySelectorAll('.ps-line')].map((line) => getComputedStyle(line).position),
    readableLines: [...story.querySelectorAll('.ps-line')].every((line) => {
      const style = getComputedStyle(line);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    }),
    buttonVisible: (() => {
      const button = story.querySelector('.ps-action');
      const style = getComputedStyle(button);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    })(),
  }));
  assert.notEqual(state.display, 'none');
  assert.equal(state.enhanced, false);
  assert.equal(state.pinned, false);
  assert.ok(state.linePositions.every((position) => position !== 'absolute'));
  assert.equal(state.readableLines, true);
  assert.equal(state.buttonVisible, true);

  await context.close();
});

test('resizing removes and restores the product cinematic without stale pin state', async () => {
  const { context, page } = await desktopPage();
  await page.goto(`${ORIGIN}/product/city-of-sins-blood-heat-bundle`, { waitUntil: 'networkidle' });
  await page.locator('.pstory.is-enhanced').waitFor();

  await page.setViewportSize({ width: 1004, height: 847 });
  await page.waitForTimeout(500);
  const compact = await page.locator('.pstory').evaluate((story) => ({
    enhanced: story.classList.contains('is-enhanced'),
    pinned: story.parentElement.classList.contains('pin-spacer'),
    linePositions: [...story.querySelectorAll('.ps-line')].map((line) => getComputedStyle(line).position),
    readableLines: [...story.querySelectorAll('.ps-line')].every((line) => {
      const style = getComputedStyle(line);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    }),
    storyTriggers: window.__ddProductStoryTriggerCount?.() ?? -1,
  }));
  assert.equal(compact.enhanced, false);
  assert.equal(compact.pinned, false);
  assert.ok(compact.linePositions.every((position) => position !== 'absolute'));
  assert.equal(compact.readableLines, true);
  assert.equal(compact.storyTriggers, 0);

  await page.setViewportSize({ width: 1200, height: 900 });
  await page.locator('.pstory.is-enhanced').waitFor();
  assert.equal(await page.locator('.pstory').evaluate((story) => story.parentElement.classList.contains('pin-spacer')), true);
  assert.equal(await page.evaluate(() => window.__ddProductStoryTriggerCount?.() ?? -1), 1);

  await context.close();
});

test('the duplicate product story stays out of the phone layout', async () => {
  const { context, page } = await phonePage();
  await page.goto(`${ORIGIN}/product/city-of-sins-blood-heat-bundle`, { waitUntil: 'networkidle' });

  const state = await page.locator('.pstory').evaluate((story) => ({
    display: getComputedStyle(story).display,
    pinned: story.parentElement.classList.contains('pin-spacer'),
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(state.display, 'none');
  assert.equal(state.pinned, false);
  assert.equal(state.documentWidth, state.viewport);
  await page.screenshot({ path: join(tmpdir(), 'darkdivine-product-story-390.png') });

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
