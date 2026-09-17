import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'my-express-template API',
      version: '1.0.0',
      description: 'Starter template API with JWT auth and a Users resource'
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    }
  },
  apis: ['./src/modules/**/*.routes.js']
}

export default swaggerJsdoc(options)
