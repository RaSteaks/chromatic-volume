import { defineConfig, type Plugin } from 'vite';

/**
 * Social previews need an absolute `og:image`. The deployment origin is not
 * known to the repository, so a build with `SITE_URL` set writes it in;
 * without it the origin-relative path stays.
 */
function absoluteOgImage(site = process.env.SITE_URL): Plugin {
  return {
    name: 'absolute-og-image',
    transformIndexHtml(html) {
      if (!site) return html;
      return html.replace(
        /(<meta property="og:image" content=")([^"]+)(")/,
        (_, start: string, path: string, end: string) =>
          `${start}${new URL(path, site).href}${end}`,
      );
    },
  };
}

export default defineConfig({
  plugins: [absoluteOgImage()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  build: {
    target: 'es2022',
    rollupOptions: { input: ['index.html', 'preview/index.html'] },
  },
});
