import pino from 'pino'
import env from './env.js'

const transport = env.NODE_ENV === 'production'
  ? undefined
  : {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
    }

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport
})

export default logger
