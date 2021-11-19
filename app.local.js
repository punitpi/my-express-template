const app = require('./app')

const port = process.env.PORT || 4600

const server = app.listen(port, () =>
  console.log(`Server is running on: http://localhost:${port}`)
)
