import prisma from '../src/lib/prisma.js'

export async function resetDb () {
  await prisma.refreshToken.deleteMany()
  await prisma.user.deleteMany()
}
