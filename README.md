# Express API Starter Template Project

## Dependencies:

- [cors](https://www.npmjs.com/package/cors)
  - CORS is a node.js package for providing a Connect/Express middleware that can be used to enable CORS with various options.
- [dotenv](https://www.npmjs.com/package/dotenv)
  - Dotenv is a zero-dependency module that loads environment variables from a `.env` file into `process.env`
- [helmet](https://www.npmjs.com/package/helmet)
  - Helmet helps you secure your Express apps by setting various HTTP headers. It's not a silver bullet, but it can help!
- [morgan](https://www.npmjs.com/package/morgan)
  - HTTP request logger middleware for node.js

## Development Dependencies:

- [eslint](https://www.npmjs.com/package/eslint)
  - ESLint is a tool for identifying and reporting on patterns found in ECMAScript/JavaScript code.
- [nodemon](https://www.npmjs.com/package/nodemon)
  - nodemon is a tool that helps develop node.js based applications by automatically restarting the node application when file changes in the directory are detected.
- [standard](https://www.npmjs.com/package/standard)

  - Standard JS is detailed as "A JavaScript Standard Style". It is a Style guide, with linter & automatic code fixer. It is a way to enforce consistent style in your project. It automatically formats code.

## Scripts

### start

Run the project using nodemon

```
nodemon app.local.js --trace-warnings
```

### startnode

Run the project using node

```
node app.local.js
```

### lint

Runs eslint

```
eslint './**'
```

### lintfix

Run standard and eslint and fix the issues

```
standard --fix & eslint './**' --fix
```
