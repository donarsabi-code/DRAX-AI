import { getCurrentUser, jsonError } from '@/lib/auth-server'
import { getChatProvider, AI_MODELS } from '@/lib/ai-provider'

export async function GET() {
  try {
    const user = await getCurrentUser()
    // Le fournisseur par défaut (« fast ») sert à l'état global de dispo.
    const provider = getChatProvider('fast')
    const preferred = (user as { aiModel?: string } | null)?.aiModel
    return Response.json({
      user: user
        ? {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            bio: user.bio,
            installGuideDismissed: user.installGuideDismissed,
            createdAt: user.createdAt,
            aiModel: preferred === 'reasoning' ? 'reasoning' : 'fast',
          }
        : null,
      ai: {
        providerId: provider.id,
        displayName: provider.displayName,
        modelId: provider.modelId,
        available: provider.available,
        unavailableReason: provider.unavailableReason ?? null,
        // Liste des modèles réellement proposés par le sélecteur (2 modes)
        models: Object.values(AI_MODELS),
      },
    })
  } catch (error) {
    console.error('[me]', error)
    return jsonError('Erreur serveur.', 500)
  }
}
