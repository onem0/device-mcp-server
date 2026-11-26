// The panel is built as a static SPA (nuxt generate) and served by the Fastify server.
// In development the Nuxt dev server forwards /v1 to the local server.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: false,
  devtools: { enabled: false },
  devServer: { port: 3001 },
  css: [
    '@fontsource-variable/archivo/wdth.css',
    '@fontsource/jetbrains-mono/400.css',
    '@fontsource/jetbrains-mono/600.css',
    '~/assets/css/main.css',
  ],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      titleTemplate: '%s · device-mcp',
      meta: [
        { name: 'robots', content: 'noindex' },
        { name: 'theme-color', content: '#eceee9' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  routeRules: {
    '/v1/**': { proxy: `${process.env.API_URL ?? 'http://127.0.0.1:3100'}/v1/**` },
  },
})
