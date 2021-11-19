const express = require('express')
const path = require('path')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const cors = require('cors')
const logger = require('morgan')
require('dotenv').config()

const indexRouter = require('./routes/index')
const usersRouter = require('./routes/users')

const app = express()

app.use(logger('dev'))
app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))

app.use('/', indexRouter)
app.use('/users', usersRouter)

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  res.status(404)
  const error = new Error(`Page Not Found - ${req.originalUrl}`)
  next(error)
})

// error handler
app.use(function (err, req, res, next) {
  let statusCode =
    res.statusCode !== 200
      ? res.statusCode || err.status || err.statusCode
      : 500
  if (statusCode < 400) statusCode = 500
  res.status(statusCode)

  if (statusCode >= 500) {
    console.error(err.stack)
    res.json(err)
    return
  }

  res.json({
    message: err.message,
    stack: process.env.ENVIRONMENT === 'dev' ? err.stack : 'Error'
  })
})

module.exports = app
