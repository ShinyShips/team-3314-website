import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Static output (the default).
  site: 'https://frc3314.com',
  integrations: [sitemap()],
});
