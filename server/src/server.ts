import { env } from './env.js'
import { buildApp } from './app.js'
import { runMigrations } from './db/migrate.js'

await runMigrations()
const app = await buildApp()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Server wird beendet')
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    )
  })
}

await app.listen({ port: env.PORT, host: env.HOST })
