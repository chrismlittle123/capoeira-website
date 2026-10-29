import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // The service worker is served as-is from public/ and registered by URL in
  // src/layouts/Base.astro, so nothing imports it.
  entry: ['public/sw.js'],
  compilers: {
    // Fonts are pulled in with CSS @import (src/styles/global.css); turn each one
    // into a JS import so knip sees the @fontsource packages are used.
    css: (text: string) => [...text.matchAll(/(?<=@)import[^;]+/g)].join('\n'),
  },
};

export default config;
