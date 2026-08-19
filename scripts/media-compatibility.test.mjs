import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeCampaignMedia,
  normalizeMediaUrl,
  normalizeProductMedia,
  normalizeSiteSettings,
} from '../src/lib/media.js';

test('legacy local media URLs resolve to the organized media folders', () => {
  assert.equal(normalizeMediaUrl('/content/cafe-fit.webp'), '/media/editorial/cafe-fit.webp');
  assert.equal(normalizeMediaUrl('/images/products/1.webp'), '/media/products/1.webp');
  assert.equal(normalizeMediaUrl('/images/look.webp'), '/media/editorial/look.webp');
  assert.equal(normalizeMediaUrl('/brand/logo.glb'), '/media/brand/logo.glb');
  assert.equal(normalizeMediaUrl('/favicon.ico'), '/media/brand/favicon.ico');
  assert.equal(
    normalizeMediaUrl('https://darkdivine.store/content/cafe-fit.webp?size=large#look'),
    'https://darkdivine.store/media/editorial/cafe-fit.webp?size=large#look',
  );
  assert.equal(normalizeMediaUrl('https://cdn.example.com/images/look.webp'), 'https://cdn.example.com/images/look.webp');
  assert.equal(normalizeMediaUrl(''), '');
  assert.equal(normalizeMediaUrl(null), null);
});

test('persisted settings, products, and campaigns normalize legacy media fields', () => {
  assert.deepEqual(
    normalizeSiteSettings({ dropImage: '/content/drop.webp', supportEmail: 'help@example.com' }),
    { dropImage: '/media/editorial/drop.webp', supportEmail: 'help@example.com' },
  );
  assert.deepEqual(
    normalizeProductMedia({
      images: ['/images/products/1.webp', 'https://cdn.example.com/two.webp'],
      colorImages: { Black: '/images/products/1.webp' },
    }),
    {
      images: ['/media/products/1.webp', 'https://cdn.example.com/two.webp'],
      colorImages: { Black: '/media/products/1.webp' },
    },
  );
  assert.deepEqual(
    normalizeCampaignMedia({ id: 7, hero_image_url: '/content/drop.webp' }),
    { id: 7, hero_image_url: '/media/editorial/drop.webp' },
  );
});

test('persisted homepage lists normalize nested image, video, poster, and model URLs', () => {
  const settings = normalizeSiteSettings({
    homepage: {
      storyImage: '/content/story.webp',
      signupVideo: '/content/signup.mp4',
      dropOutroLogoModel: '/brand/logo.glb',
      reelItems: [{ type: 'video', src: '/content/reel.mp4', poster: '/images/poster.jpg' }],
      lookbookItems: [{ src: '/images/look.webp', tag: 'look' }],
    },
  });

  assert.deepEqual(settings.homepage, {
    storyImage: '/media/editorial/story.webp',
    signupVideo: '/media/editorial/signup.mp4',
    dropOutroLogoModel: '/media/brand/logo.glb',
    reelItems: [{ type: 'video', src: '/media/editorial/reel.mp4', poster: '/media/editorial/poster.jpg' }],
    lookbookItems: [{ src: '/media/editorial/look.webp', tag: 'look' }],
  });
});
