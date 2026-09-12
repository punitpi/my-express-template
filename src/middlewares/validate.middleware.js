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
      req[key] = result.data
    }
    next()
  }
}
