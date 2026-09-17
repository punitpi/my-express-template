import 'dotenv/config'
import app from './src/app.js'
import env from './src/lib/env.js'
import logger from './src/lib/logger.js'

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on http://localhost:${env.PORT}`)
})

function shutdown (signal) {
  logger.info(`${signal} received, shutting down`)
  server.close(() => process.exit(0))
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
