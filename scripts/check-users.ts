import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const users = await db.user.findMany({ select: { id: true, email: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 20 })
  console.log('Users:', JSON.stringify(users.map(u => ({ email: u.email, createdAt: u.createdAt })), null, 1))
  console.log('Total:', await db.user.count())
}
main().finally(() => db.$disconnect())
