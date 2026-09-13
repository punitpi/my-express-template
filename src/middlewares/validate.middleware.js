import { ValidationError } from '../lib/errors.js'

export default function validate (schemas) {
  return (req, res, next) => {
    for (const key of ['body', 'params', 'query']) {
      const schema = schemas[key]
      if (!schema) continue

      const result = schema.safeParse(req[key])
      if (!result.success) {
        return next(new ValidationError('Invalid request', result.error.flatten()))
      }

      if (key === 'query') {
        // Express 5 defines req.query as a getter-only accessor on the
        // shared request prototype, so plain assignment throws in strict
        // mode (ESM). Shadow it with an own, writable property instead.
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true
        })
      } else {
        req[key] = result.data
      }
    }
    next()
  }
}
