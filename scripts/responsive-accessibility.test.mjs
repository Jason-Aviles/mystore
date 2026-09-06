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

test('the phone access gate keeps an exit reachable above a short keyboard viewport', async () => {
  const { context, page } = await phonePage({ viewport: { width: 390, height: 520 } });
  await page.goto(`${ORIGIN}/?gate`, { waitUntil: 'networkidle' });

  const gate = page.locator('.gate');
  const exit = page.getByRole('button', { name: /browse site/i });
  await exit.waitFor();
  const activeField = await page.evaluate(() => document.activeElement?.getAttribute('name'));
  assert.notEqual(activeField, 'email', 'the phone gate must not open the keyboard before the visitor asks for it');
  const layout = await gate.evaluate((element) => {
    const button = element.querySelector('.gate-mobile-exit');
    const rect = button.getBoundingClientRect();
    return {
      buttonTop: rect.top,
      buttonRight: rect.right,
      buttonBottom: rect.bottom,
      viewportWidth: visualViewport.width,
      viewportHeight: visualViewport.height,
      horizontalOffset: visualViewport.offsetLeft,
    };
  });
  assert.ok(layout.buttonTop >= 0 && layout.buttonBottom <= layout.viewportHeight);
  assert.ok(layout.buttonRight <= layout.viewportWidth);
  assert.equal(layout.horizontalOffset, 0, 'focused gate fields must not pan the phone viewport sideways');

  await exit.click();
  await gate.waitFor({ state: 'detached' });
  await context.close();
});

test('locked visitors can open every trust route from the phone gate', async () => {
  const { context, page } = await phonePage({ viewport: { width: 390, height: 520 } });
  await page.goto(`${ORIGIN}/?gate`, { waitUntil: 'networkidle' });

  const policyNav = page.getByRole('navigation', { name: /policies and support/i });
  await policyNav.scrollIntoViewIfNeeded();
  for (const name of ['Shipping', 'Returns', 'Privacy', 'Terms', 'Contact']) {
    assert.equal(await policyNav.getByRole('button', { name }).count(), 1);
  }
  await policyNav.getByRole('button', { name: 'Terms' }).click();
  await page.waitForURL('**/terms');
  assert.equal(await page.locator('.gate').count(), 0);
  const heading = page.getByRole('heading', { name: 'Terms of Service', level: 1 });
  await heading.waitFor();
  assert.equal(await heading.count(), 1);

  await context.close();
});

test('admin can hide private entry while keeping waitlist and policy access', async () => {
  const { context, page } = await phonePage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem('dd_site_settings', JSON.stringify({ gateEntryEnabled: false }));
  });
  await page.goto(`${ORIGIN}/?gate`, { waitUntil: 'networkidle' });

  assert.equal(await page.locator('input[name="access-code"]').count(), 0);
  assert.equal(await page.getByRole('button', { name: /enter private preorder/i }).count(), 0);
  assert.equal(await page.locator('.gate').getByRole('button', { name: /^join the list$/i }).count(), 1);
  assert.equal(await page.getByRole('navigation', { name: /policies and support/i }).count(), 1);

  await context.close();
});

test('the preorder-only admin setting redirects ordinary storefront routes', async () => {
  const { context, page } = await desktopPage();
  await page.addInitScript(() => {
    localStorage.setItem('dd_site_settings', JSON.stringify({
      preorderOnlyLock: true,
      gateEnabled: true,
      gateGuestBypass: false,
    }));
  });

  await page.goto(`${ORIGIN}/shop`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/drop');
  assert.equal(new URL(page.url()).pathname, '/drop');

  await page.goto(`${ORIGIN}/cart`, { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/cart');
  await page.goto(`${ORIGIN}/privacy`, { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/privacy');

  await context.close();
});

test('site settings save while built-in relative media is selected', async () => {
  const { context, page } = await desktopPage();
  await page.addInitScript(() => sessionStorage.setItem('dd_admin', '1'));

  await page.goto(`${ORIGIN}/admin/settings`, { waitUntil: 'networkidle' });
  const setting = page.locator('.settings-field').filter({ hasText: 'Preorder-only storefront' });
  await setting.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await page.locator('.pill.ok').waitFor();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dd_site_settings') || '{}'));
  assert.equal(stored.preorderOnlyLock, true);
  await context.close();
});

test('turning preorder-only mode off removes the saved backend override', async () => {
  const { context, page } = await desktopPage();
  await page.addInitScript(() => {
    sessionStorage.setItem('dd_admin', '1');
    if (!sessionStorage.getItem('dd_settings_seeded')) {
      localStorage.setItem('dd_site_settings', JSON.stringify({
        preorderOnlyLock: true,
        heroVideoA: 'https://example.com/a.mp4',
        heroVideoB: 'https://example.com/b.mp4',
      }));
      sessionStorage.setItem('dd_settings_seeded', '1');
    }
  });

  await page.goto(`${ORIGIN}/admin/settings`, { waitUntil: 'networkidle' });
  const setting = page.locator('.settings-field').filter({ hasText: 'Preorder-only storefront' });
  const toggle = setting.locator('input[type="checkbox"]');
  await toggle.waitFor();
  assert.equal(await toggle.isChecked(), true);

  await toggle.uncheck();
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await page.locator('.pill.ok').waitFor();
  await page.reload({ waitUntil: 'networkidle' });

  assert.equal(await setting.locator('input[type="checkbox"]').isChecked(), false);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dd_site_settings') || '{}'));
  assert.equal(stored.preorderOnlyLock, undefined);
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

test('the desktop film reel advances through four pinned scroll beats', async () => {
  const { context, page } = await desktopPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });

  const reel = page.locator('.filmstrip');
  await page.waitForFunction(() => document.querySelector('.filmstrip')?.classList.contains('is-scroll-reel'));

  const setup = await reel.evaluate((section) => ({
    pinned: section.parentElement?.classList.contains('pin-spacer'),
    activeCards: section.querySelectorAll('.fs-card.is-active').length,
    beat: section.querySelector('.fs-beat')?.textContent.trim(),
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(setup.pinned, true, 'the desktop reel must own a pin spacer');
  assert.equal(setup.activeCards, 1, 'exactly one reel card must be active');
  assert.equal(setup.beat, '01 / 04');
  assert.equal(setup.documentWidth, setup.viewport, 'the reel must not create page overflow');

  const pin = reel.locator('xpath=..');
  const pinBox = await pin.evaluate((element) => ({ height: element.getBoundingClientRect().height }));
  assert.ok(pinBox.height > 2700, `the pin must reserve four readable beats; received ${pinBox.height}px`);

  const reachBeat = async (expectedBeat) => {
    const expected = Number.parseInt(expectedBeat, 10);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await reel.evaluate((section) => ({
        beat: section.querySelector('.fs-beat')?.textContent.trim(),
        top: section.getBoundingClientRect().top,
      }));
      if (state.beat === expectedBeat && Math.abs(state.top) < 2) {
        await page.waitForTimeout(280);
        const settledBeat = await reel.locator('.fs-beat').textContent();
        if (settledBeat.trim() === expectedBeat) return;
      }
      const current = Number.parseInt(state.beat, 10);
      const delta = state.top > 2
        ? (state.top > 900 ? 600 : Math.max(35, state.top * 0.28))
        : (current > expected ? -100 : 100);
      await page.mouse.wheel(0, delta);
      await page.waitForTimeout(90);
    }
    assert.fail(`wheel scrolling never reached reel beat ${expectedBeat}`);
  };

  const samples = [];
  for (const beat of ['01 / 04', '02 / 04', '03 / 04', '04 / 04']) {
    await reachBeat(beat);
    await page.waitForTimeout(180);
    samples.push(await reel.evaluate((section) => {
      const active = section.querySelector('.fs-card.is-active');
      const track = section.querySelector('.fs-track');
      return {
        beat: section.querySelector('.fs-beat')?.textContent.trim(),
        activeCards: section.querySelectorAll('.fs-card.is-active').length,
        activeVisible: active ? active.getBoundingClientRect().right > 0
          && active.getBoundingClientRect().left < innerWidth : false,
        trackX: new DOMMatrixReadOnly(getComputedStyle(track).transform).m41,
      };
    }));
  }

  assert.deepEqual(samples.map(({ beat }) => beat), ['01 / 04', '02 / 04', '03 / 04', '04 / 04']);
  assert.ok(samples.every(({ activeCards, activeVisible }) => activeCards === 1 && activeVisible));
  assert.ok(samples[1].trackX < samples[0].trackX - 100, 'second beat must move the reel');
  assert.ok(samples[2].trackX < samples[1].trackX - 100, 'third beat must move the reel');
  assert.ok(samples[3].trackX < samples[2].trackX - 100, 'fourth beat must reach the reel ending');

  await context.close();
});

test('the film reel stays unpinned and swipeable with reduced motion', async () => {
  const { context, page } = await desktopPage({
    viewport: { width: 1200, height: 900 },
    reducedMotion: 'reduce',
  });
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.locator('.filmstrip').waitFor();

  const state = await page.locator('.filmstrip').evaluate((section) => ({
    enhanced: section.classList.contains('is-scroll-reel'),
    pinned: section.parentElement?.classList.contains('pin-spacer'),
    overflowX: getComputedStyle(section.querySelector('.fs-wrap')).overflowX,
    documentWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  assert.equal(state.enhanced, false);
  assert.equal(state.pinned, false);
  assert.equal(state.overflowX, 'auto');
  assert.equal(state.documentWidth, state.viewport);

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

test('the phone cinematic transition keeps the second video full-bleed', async () => {
  const { context, page } = await phonePage();
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.25));
  await page.waitForTimeout(900);

  const frame = await page.locator('[data-hero-secondary-film]').boundingBox();
  assert.ok(frame, 'second hero frame must be rendered');
  assert.ok(frame.width >= 390, `second hero frame is only ${Math.round(frame.width)}px wide`);
  assert.ok(frame.height >= 844, `second hero frame is only ${Math.round(frame.height)}px tall`);
  assert.equal(await page.locator('.hs-slat, .hs-monolith').count(), 0);

  await context.close();
});

test('the tablet cinematic transition also remains full-bleed', async () => {
  const viewport = { width: 768, height: 1024 };
  const { context, page } = await phonePage({ viewport });
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.25));
  await page.waitForTimeout(900);

  const frame = await page.locator('[data-hero-secondary-film]').boundingBox();
  assert.ok(frame, 'tablet hero frame must be rendered');
  assert.ok(frame.width >= viewport.width, `tablet hero frame is only ${Math.round(frame.width)}px wide`);
  assert.ok(frame.height >= viewport.height, `tablet hero frame is only ${Math.round(frame.height)}px tall`);

  await context.close();
});

test('the ultrawide cinematic transition keeps both films full-bleed through the splice', async () => {
  const viewport = { width: 3790, height: 1742 };
  const { context, page } = await desktopPage({ viewport });
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.scroll-progress')?.style.transform);

  const heroRange = await page.locator('.hero-cine2').evaluate((hero) => {
    const spacer = hero.parentElement;
    return {
      top: spacer.classList.contains('pin-spacer') ? spacer.offsetTop : hero.offsetTop,
      distance: spacer.offsetHeight - hero.offsetHeight,
    };
  });
  assert.ok(
    heroRange.distance >= viewport.height * 2.15 && heroRange.distance <= viewport.height * 2.25,
    `desktop hero pins for ${Math.round(heroRange.distance / viewport.height * 100)}vh instead of the 220vh splice`,
  );
  assert.equal(await page.locator('.hs-monolith, .hs-floor').count(), 0);

  for (const progress of [0.25, 0.4, 0.55, 0.7, 0.9]) {
    await page.evaluate(({ top, distance, progress: point }) => {
      window.scrollTo(0, top + distance * point);
    }, { ...heroRange, progress });
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => {
      const firstFilm = document.querySelector('.hs-video');
      const secondFilm = document.querySelector('[data-hero-secondary-film]');
      const firstScene = document.querySelector('.hs-a');
      const secondScene = document.querySelector('.hs-b');
      const firstRect = firstFilm?.getBoundingClientRect();
      const secondRect = secondFilm?.getBoundingClientRect();
      return {
        firstRect: firstRect && { width: firstRect.width, height: firstRect.height },
        secondRect: secondRect && { width: secondRect.width, height: secondRect.height },
        firstOpacity: Number(getComputedStyle(firstScene).opacity),
        secondOpacity: Number(getComputedStyle(secondScene).opacity),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    assert.ok(state.firstRect, `first film must render at ${progress} progress`);
    assert.ok(state.secondRect, `second film must render at ${progress} progress`);
    assert.ok(state.firstRect.width >= viewport.width - 1 && state.firstRect.height >= viewport.height - 1);
    assert.ok(state.secondRect.width >= viewport.width - 1 && state.secondRect.height >= viewport.height - 1);
    assert.ok(state.firstOpacity + state.secondOpacity >= 0.95, `film coverage fades out at ${progress} progress`);
    assert.equal(state.overflow, 0);
  }

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

test('support form saves a request and returns a reference without opening email', async () => {
  const { context, page } = await phonePage({ reducedMotion: 'reduce' });
  await page.goto(`${ORIGIN}/contact`, { waitUntil: 'networkidle' });

  await page.locator('form[data-support-form="message"] input[name="name"]').fill('Jamie Buyer');
  await page.locator('form[data-support-form="message"] input[name="email"]').fill('jamie@example.com');
  await page.locator('form[data-support-form="message"] textarea[name="message"]').fill('I need help choosing the right size.');
  await page.locator('form[data-support-form="message"]').getByRole('button', { name: /send message/i }).click();

  const confirmation = page.locator('[data-support-reference]');
  await confirmation.waitFor();
  const reference = await confirmation.getAttribute('data-support-reference');
  assert.match(reference, /^DD-\d{6}-[A-F0-9]{12}$/);
  assert.match(await confirmation.textContent(), new RegExp(`Request ${reference} received`));
  assert.equal(await page.locator('form[data-support-form="message"] textarea[name="message"]').inputValue(), '');
  assert.equal(new URL(page.url()).protocol, 'http:');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dd_demo_support_requests') || '[]'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].reference, reference);
  assert.equal(stored[0].email, 'jamie@example.com');

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
