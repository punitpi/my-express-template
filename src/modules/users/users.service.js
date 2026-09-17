import prisma from '../../lib/prisma.js'
import { ConflictError, NotFoundError } from '../../lib/errors.js'
import { toPublicUser } from './users.serializer.js'

async function getById (id) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new NotFoundError('User not found')
  return toPublicUser(user)
}

async function updateEmail (id, email) {
  try {
    const user = await prisma.user.update({ where: { id }, data: { email } })
    return toPublicUser(user)
  } catch (err) {
    if (err.code === 'P2002') throw new ConflictError('Email already in use')
    throw err
  }
}

async function remove (id) {
  await prisma.user.delete({ where: { id } })
}

export default { getById, updateEmail, remove }
