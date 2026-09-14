import prisma from '../src/lib/prisma.js'

export async function resetDb () {
  if (!process.env.DATABASE_URL?.includes('test')) {
    throw new Error(`Refusing to reset a non-test database: ${process.env.DATABASE_URL}`)
  }

  await prisma.refreshToken.deleteMany()
  await prisma.user.deleteMany()
}
