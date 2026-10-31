import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, unauthorized, jsonError } from '@/lib/auth-server'

/**
 * Recherche dans les conversations de l'utilisateur :
 * - titres correspondants
 * - messages contenant le texte recherché (extrait de contexte renvoyé)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()

    const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100)
    if (q.length < 2) {
      return Response.json({ results: [] })
    }

    // 1. Conversations dont le titre correspond
    const titleMatches = await db.conversation.findMany({
      where: {
        userId: user.id,
        title: { contains: q },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, updatedAt: true },
    })

    // 2. Messages contenant la requête (SQLite : LIKE insensible à la casse ASCII)
    const messageMatches = await db.message.findMany({
      where: {
        userId: user.id,
        content: { contains: q },
        conversation: { userId: user.id },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        conversationId: true,
        role: true,
        content: true,
        createdAt: true,
        conversation: { select: { id: true, title: true, updatedAt: true } },
      },
    })

    // Extrait une fenêtre de contexte autour de la première occurrence
    const lowerQ = q.toLowerCase()
    const results = [
      ...titleMatches.map((c) => ({
        conversationId: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        matchType: 'title' as const,
        snippet: null as string | null,
        messageRole: null as string | null,
      })),
      ...messageMatches.map((m) => {
        const idx = m.content.toLowerCase().indexOf(lowerQ)
        const start = Math.max(0, idx - 60)
        const snippet =
          (start > 0 ? '…' : '') +
          m.content.slice(start, idx + q.length + 80) +
          (idx + q.length + 80 < m.content.length ? '…' : '')
        return {
          conversationId: m.conversationId,
          title: m.conversation.title,
          updatedAt: m.conversation.updatedAt,
          matchType: 'message' as const,
          snippet,
          messageRole: m.role,
        }
      }),
    ]

    // Déduplique les conversations (priorité au match de titre) et trie par date
    const seen = new Set<string>()
    const deduped = results
      .filter((r) => {
        if (seen.has(r.conversationId)) return false
        seen.add(r.conversationId)
        return true
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 30)

    return Response.json({ results: deduped })
  } catch (error) {
    console.error('[search]', error)
    return jsonError('Erreur serveur.', 500)
  }
}
