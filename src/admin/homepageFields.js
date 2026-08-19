const field = (key, label, type = 'text', hint = '') => ({ key, label, type, hint });
const list = (key, label, itemLabel, newItem, itemFields, hint = '') => ({
  key, label, type: 'list', itemLabel, newItem, itemFields, hint,
});

export const HOMEPAGE_FIELD_GROUPS = [
  {
    title: 'Hero text & buttons',
    fields: [
      field('heroBrandTitle', 'Broadcast brand title', 'text', 'Use | for a line break.'),
      field('heroScriptSuffix', 'Broadcast script suffix'),
      field('heroPrimaryTextDrop', 'Main button — drop mode'),
      field('heroPrimaryHrefDrop', 'Main button link — drop mode'),
      field('heroPrimaryTextShop', 'Main button — shop mode'),
      field('heroPrimaryHrefShop', 'Main button link — shop mode'),
      field('heroSecondaryText', 'Secondary button'),
      field('heroSecondaryHref', 'Secondary button link'),
      list('heroMetaItems', 'Hero trust points', 'Trust point', { text: 'New trust point' }, [field('text', 'Text')], 'Tokens such as {freeShipThreshold} update automatically.'),
    ],
  },
  {
    title: 'Ticker, manifesto & drop showcase',
    fields: [
      field('tickerText', 'Moving ticker text', 'textarea'),
      field('manifestoText', 'Manifesto', 'textarea'),
      field('dropActLabel', 'Drop act label'),
      field('dropTitle', 'Drop showcase title', 'text', 'Use | for a line break.'),
      field('dropBodyLimited', 'Limited-inventory description', 'textarea'),
      field('dropBodyGeneral', 'General drop description', 'textarea'),
      field('dropAnchorText', 'Bundle comparison line', 'text', 'Supports {comparePrice} and {price}.'),
      field('dropProductButtonText', 'Product button text'),
      field('dropOutroTitle', 'Drop outro title', 'text', 'Use | for a line break.'),
      field('dropOutroButtonDrop', 'Outro button — drop mode'),
      field('dropOutroHrefDrop', 'Outro link — drop mode'),
      field('dropOutroButtonShop', 'Outro button — shop mode'),
      field('dropOutroHrefShop', 'Outro link — shop mode'),
      field('dropOutroLogoPoster', 'Outro logo image', 'image'),
      field('dropOutroLogoModel', 'Outro 3D model', 'file', 'Upload a .glb file or paste a URL.'),
      field('dropOutroLogoAlt', 'Outro logo alt text'),
    ],
  },
  {
    title: 'Product sections',
    fields: [
      field('bestIndex', 'Best sellers number'),
      field('bestEyebrow', 'Best sellers eyebrow'),
      field('bestTitle', 'Best sellers title'),
      field('bestButtonText', 'Best sellers button'),
      field('bestButtonHref', 'Best sellers link'),
      field('newIndex', 'New arrivals number'),
      field('newEyebrow', 'New arrivals eyebrow'),
      field('newTitle', 'New arrivals title'),
    ],
  },
  {
    title: 'Brand story',
    fields: [
      field('storyIndex', 'Section number'),
      field('storyEyebrow', 'Section eyebrow'),
      field('storyScript', 'Script headline'),
      field('storyParagraph1', 'Paragraph 1', 'textarea'),
      field('storyParagraph2', 'Paragraph 2', 'textarea'),
      field('storyParagraph3', 'Paragraph 3', 'textarea'),
      field('storySignature', 'Signature'),
      field('storyImage', 'Story image', 'image'),
      field('storyImageAlt', 'Story image alt text'),
    ],
  },
  {
    title: 'Quality',
    fields: [
      field('qualityIndex', 'Section number'),
      field('qualityEyebrow', 'Section eyebrow'),
      field('qualityTitle', 'Section title'),
      list('qualityItems', 'Quality cards', 'Quality card', { number: 'V', title: 'New detail', text: '' }, [
        field('number', 'Number'), field('title', 'Title'), field('text', 'Description', 'textarea'),
      ]),
    ],
  },
  {
    title: 'Reviews',
    fields: [
      field('socialIndex', 'Section number'),
      field('socialEyebrow', 'Section eyebrow'),
      field('socialTitle', 'Section title'),
      field('socialReviewLabel', 'Rating label', 'textarea'),
      field('socialNote', 'Reviews note', 'textarea'),
    ],
  },
  {
    title: 'The Reel',
    fields: [
      field('reelIndex', 'Section symbol'),
      field('reelEyebrow', 'Section eyebrow'),
      field('reelTitle', 'Section title', 'text', 'Use | for a line break.'),
      field('reelHint', 'Drag hint'),
      list('reelItems', 'Reel media', 'Reel item', { type: 'image', src: '', poster: '', tag: 'New reel item', ratio: '1 / 1' }, [
        { ...field('type', 'Media type', 'select'), options: ['image', 'video'] },
        field('src', 'Image or video', 'media'),
        field('poster', 'Video poster', 'image'),
        field('tag', 'Caption'),
        field('ratio', 'Aspect ratio', 'text', 'Examples: 16 / 9 or 4 / 5.'),
      ]),
    ],
  },
  {
    title: 'Lookbook',
    fields: [
      field('lookbookIndex', 'Section number'),
      field('lookbookEyebrow', 'Section eyebrow'),
      field('lookbookTitle', 'Section title'),
      field('lookbookButtonText', 'Instagram button'),
      field('lookbookButtonHref', 'Instagram button link'),
      list('lookbookItems', 'Lookbook tiles', 'Lookbook tile', { src: '', alt: '', tag: 'New look', to: '/shop' }, [
        field('src', 'Image', 'image'),
        field('alt', 'Alt text'),
        field('tag', 'Caption'),
        field('to', 'Click destination'),
      ]),
    ],
  },
  {
    title: 'FAQ',
    fields: [
      field('faqIndex', 'Section number'),
      field('faqEyebrow', 'Section eyebrow'),
      field('faqTitle', 'Section title'),
      list('faqItems', 'Questions and answers', 'FAQ', { question: 'New question', answer: 'New answer' }, [
        field('question', 'Question'), field('answer', 'Answer', 'textarea', 'Use [label](/page) for links.'),
      ]),
    ],
  },
  {
    title: 'Signup',
    fields: [
      field('signupEyebrow', 'Section eyebrow'),
      field('signupTitle', 'Section title'),
      field('signupBody', 'Description', 'textarea'),
      field('signupSuccessText', 'Success message', 'textarea', 'Supports {welcomeCode}.'),
      field('signupEmailPlaceholder', 'Email placeholder'),
      field('signupButtonText', 'Signup button'),
      field('signupPhonePlaceholder', 'Phone placeholder'),
      field('signupSmsConsent', 'SMS consent text', 'textarea'),
      field('signupNote', 'Privacy note'),
      field('signupVideo', 'Background video', 'video'),
      field('signupVideoPoster', 'Background poster', 'image'),
    ],
  },
];
