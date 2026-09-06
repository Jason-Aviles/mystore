import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('brand proof fields are admin managed and hidden until genuine content exists', async () => {
  const [config, settings, about] = await Promise.all([
    read('src/lib/config.js'), read('src/admin/Settings.jsx'), read('src/pages/About.jsx'),
  ]);
  for (const key of ['founderName', 'founderRole', 'founderStatement', 'legalBusinessName', 'businessCity', 'businessRegion', 'founderImage', 'productionImages', 'packagingImages']) {
    assert.match(config, new RegExp(`${key}:`), `missing config key ${key}`);
    assert.match(settings, new RegExp(`['"]${key}['"]`), `missing admin field ${key}`);
  }
  assert.match(settings, /image-list/);
  assert.match(about, /CONFIG\.founderName/);
  assert.match(about, /CONFIG\.productionImages/);
  assert.match(about, /CONFIG\.packagingImages/);
  assert.doesNotMatch(config, /founderName:\s*['"][^'"]+['"]/);
});

test('review origin and verified-buyer meaning are disclosed where claims appear', async () => {
  const [reviewsLib, reviewsUi, footer, product] = await Promise.all([
    read('src/lib/reviews.js'), read('src/components/Reviews.jsx'), read('src/components/Footer.jsx'), read('src/pages/Product.jsx'),
  ]);
  assert.match(reviewsLib, /REVIEW_PROVENANCE/);
  assert.match(reviewsLib, /Shopify/);
  assert.match(reviewsLib, /Judge\.me/);
  assert.match(reviewsUi, /REVIEW_PROVENANCE/);
  assert.match(footer, /REVIEW_PROVENANCE/);
  assert.match(product, /REVIEW_PROVENANCE/);
});
