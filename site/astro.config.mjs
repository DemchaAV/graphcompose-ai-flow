import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://demchav.github.io',
  base: '/graphcompose-ai-flow/',
  trailingSlash: 'ignore',
  build: {
    assets: 'assets',
  },
});
