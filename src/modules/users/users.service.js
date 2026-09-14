import prisma from '../../lib/prisma.js'
import { ConflictError, NotFoundError } from '../../lib/errors.js'

function toPublicUser (user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt }
}

async function getById (id) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new NotFoundError('User not found')
  return toPublicUser(user)
}

async function updateEmail (id, email) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing && existing.id !== id) throw new ConflictError('Email already in use')

  const user = await prisma.user.update({ where: { id }, data: { email } })
  return toPublicUser(user)
}

async function remove (id) {
  await prisma.user.delete({ where: { id } })
}

export default { getById, updateEmail, remove }
