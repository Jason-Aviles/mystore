const MEDIA_SETTING_KEYS = [
  'dropImage', 'heroVideoA', 'heroPosterA', 'heroVideoB', 'heroPosterB',
  'shopCampaignImage', 'popupImage',
];

function normalizeLocalMediaPath(pathname) {
  if (pathname === '/favicon.ico') return '/media/brand/favicon.ico'; // media-integrity-ignore: legacy migration key
  if (pathname.startsWith('/images/products/')) return pathname.replace('/images/products/', '/media/products/');
  if (pathname.startsWith('/images/')) return pathname.replace('/images/', '/media/editorial/');
  if (pathname.startsWith('/content/')) return pathname.replace('/content/', '/media/editorial/');
  if (pathname.startsWith('/brand/')) return pathname.replace('/brand/', '/media/brand/');
  return pathname;
}

/** Keep admin-persisted local media URLs working after the media reorganization. */
export function normalizeMediaUrl(value) {
  if (typeof value !== 'string' || !value) return value;
  if (value.startsWith('/')) return normalizeLocalMediaPath(value);

  try {
    const url = new URL(value);
    if (url.hostname.replace(/^www\./, '') !== 'darkdivine.store') return value;
    url.pathname = normalizeLocalMediaPath(url.pathname);
    return url.href;
  } catch {
    return value;
  }
}

export function normalizeSiteSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
  const normalized = { ...settings };
  for (const key of MEDIA_SETTING_KEYS) {
    if (key in normalized) normalized[key] = normalizeMediaUrl(normalized[key]);
  }
  if (normalized.homepage && typeof normalized.homepage === 'object' && !Array.isArray(normalized.homepage)) {
    const homepage = { ...normalized.homepage };
    for (const key of ['storyImage', 'dropOutroLogoPoster', 'dropOutroLogoModel', 'signupVideo', 'signupVideoPoster']) {
      if (key in homepage) homepage[key] = normalizeMediaUrl(homepage[key]);
    }
    if (Array.isArray(homepage.reelItems)) {
      homepage.reelItems = homepage.reelItems.map((item) => ({
        ...item,
        src: normalizeMediaUrl(item.src),
        poster: normalizeMediaUrl(item.poster),
      }));
    }
    if (Array.isArray(homepage.lookbookItems)) {
      homepage.lookbookItems = homepage.lookbookItems.map((item) => ({
        ...item,
        src: normalizeMediaUrl(item.src),
      }));
    }
    normalized.homepage = homepage;
  }
  return normalized;
}

export function normalizeProductMedia(product) {
  if (!product || typeof product !== 'object') return product;
  const normalized = {
    ...product,
    images: Array.isArray(product.images) ? product.images.map(normalizeMediaUrl) : [],
  };
  if (product.colorImages && typeof product.colorImages === 'object') {
    normalized.colorImages = Object.fromEntries(
      Object.entries(product.colorImages).map(([color, url]) => [color, normalizeMediaUrl(url)]),
    );
  }
  return normalized;
}

export function normalizeCampaignMedia(campaign) {
  if (!campaign || typeof campaign !== 'object') return campaign;
  return { ...campaign, hero_image_url: normalizeMediaUrl(campaign.hero_image_url) };
}
