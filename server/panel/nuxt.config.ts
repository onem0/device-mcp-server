// Das Panel wird als statische SPA gebaut (nuxt generate) und vom Fastify-Server ausgeliefert.
// In der Entwicklung leitet der Nuxt-Dev-Server /v1 an den lokalen Server weiter.
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
