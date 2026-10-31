import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const emails = ['cfg-test-owner@example.com', 'cfg-user2@example.com', 'flux-demo@example.com']
  const del = await db.user.deleteMany({ where: { email: { in: emails } } })
  const settings = await db.serverSetting.deleteMany({})
  const otps = await db.emailOtpCode.deleteMany({ where: { email: { contains: 'example.com' } } })
  console.log(`Utilisateurs de test supprimés: ${del.count}`)
  console.log(`ServerSetting réinitialisés: ${settings.count}`)
  console.log(`Codes OTP de test supprimés: ${otps.count}`)
  console.log('Utilisateurs restants:', await db.user.count())
  console.log('ServerSetting restants:', await db.serverSetting.count())
}
main().finally(() => db.$disconnect())
