# Express API Starter Template Project

## Dependencies:

- [compression](https://www.npmjs.com/package/compression)
  - Returns the compression middleware using the given options. The middleware will attempt to compress response bodies for all request that traverse through the middleware
- [cookie-parser](https://www.npmjs.com/package/cookie-parser)
  - Parse Cookie header and populate req.cookies with an object keyed by the cookie names. Optionally you may enable signed cookie support by passing a secret string, which assigns req.secret so it may be used by other middleware.
- [cors](https://www.npmjs.com/package/cors)
  - CORS is a node.js package for providing a Connect/Express middleware that can be used to enable CORS with various options
- [debug](https://www.npmjs.com/package/debug)
  - A tiny JavaScript debugging utility modelled after Node.js core's debugging technique. Works in Node.js and web browsers
- [dotenv](https://www.npmjs.com/package/dotenv)
  - Dotenv is a zero-dependency module that loads environment variables from a `.env` file into `process.env`
- [express](https://www.npmjs.com/package/express)
  - Small, robust tooling for HTTP servers
- [helmet](https://www.npmjs.com/package/helmet)
  - Helmet helps you secure your Express apps by setting various HTTP headers. It's not a silver bullet, but it can help!
- [http-errors](https://www.npmjs.com/package/http-errors)
  - Create HTTP errors for Express, Koa, Connect, etc. with ease
- [morgan](https://www.npmjs.com/package/morgan)
  - HTTP request logger middleware for node.js

## Development Dependencies:

- [nodemon](https://www.npmjs.com/package/nodemon)
  - nodemon is a tool that helps develop node.js based applications by automatically restarting the node application when file changes in the directory are detected.
- [standard](https://www.npmjs.com/package/standard)

  - Standard JS is detailed as "A JavaScript Standard Style". It is a Style guide, with linter & automatic code fixer. It is a way to enforce consistent style in your project. It automatically formats code.

## Scripts

### build-dev

Installs all the dependencies

```
npm i
```

### build-prod

Installs all the dependencies for production

```
npm ci --only=production
```

### dev

Run the project using nodemon

```
nodemon app.local.js --trace-warnings
```

### start

Run the project using node

```
node ./bin/www
```

### lint

Runs Standard JS Lint

```
standard './*.js'
```

### lintfix

Run Standard JS lint and fix the issues

```
standard ./*.js --fix
```
