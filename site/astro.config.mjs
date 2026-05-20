import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://demchaav.github.io',
  base: '/graphcompose-ai-flow/',
  trailingSlash: 'ignore',
  build: {
    assets: 'assets',
  },
});
