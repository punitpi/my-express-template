import { Router } from 'express'
import authMiddleware from '../../middlewares/auth.middleware.js'
import validate from '../../middlewares/validate.middleware.js'
import { updateMeSchema } from './users.schema.js'
import { getMe, updateMe, deleteMe } from './users.controller.js'

const router = Router()

router.use(authMiddleware)

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get the current authenticated user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Current user }
 *       401: { description: Missing or invalid access token }
 */
router.get('/me', getMe)

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Update the current authenticated user's email
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Updated user }
 *       409: { description: Email already in use }
 */
router.patch('/me', validate(updateMeSchema), updateMe)

/**
 * @swagger
 * /users/me:
 *   delete:
 *     summary: Delete the current authenticated user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: User deleted }
 */
router.delete('/me', deleteMe)

export default router
