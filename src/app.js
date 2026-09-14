import express from 'express'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import pinoHttp from 'pino-http'
import helmet from 'helmet'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import swaggerSpec from './docs/swagger.js'
import logger from './lib/logger.js'
import env from './lib/env.js'
import authRouter from './modules/auth/auth.routes.js'
import usersRouter from './modules/users/users.routes.js'
import notFoundMiddleware from './middlewares/notFound.middleware.js'
import errorMiddleware from './middlewares/error.middleware.js'

const app = express()

app.use(compression())
app.use(pinoHttp({ logger }))
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: env.NODE_ENV === 'production' ? {} : { upgradeInsecureRequests: null }
  }
}))
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

app.get('/docs.json', (req, res) => res.json(swaggerSpec))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

app.use('/auth', authRouter)
app.use('/users', usersRouter)

app.use(notFoundMiddleware)
app.use(errorMiddleware)

export default app
