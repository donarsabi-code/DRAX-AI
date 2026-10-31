import { destroyCurrentSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth-server'

export async function POST() {
  try {
    await destroyCurrentSession()
  } catch (error) {
    console.error('[logout]', error)
  }
  const options = sessionCookieOptions()
  const res = Response.json({ ok: true })
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=${options.path}; Max-Age=0; HttpOnly; SameSite=Lax${options.secure ? '; Secure' : ''}`,
  )
  return res
}
