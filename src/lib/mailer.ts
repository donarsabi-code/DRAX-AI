/**
 * Envoi d'e-mails transactionnels — DRAX IA Chat
 *
 * Transport SMTP réel via nodemailer, piloté par la configuration serveur :
 *   1. base de données (Paramètres → Serveur — prioritaire) ;
 *   2. variables d'environnement : SMTP_HOST, SMTP_PORT, SMTP_USER,
 *      SMTP_PASS, SMTP_FROM (repli historique).
 *
 * Si aucun SMTP n'est configuré, isEmailConfigured() renvoie false et les
 * routes appelantes basculent en mode développement (le code est renvoyé dans
 * la réponse API, clairement étiqueté — même comportement que la
 * réinitialisation de mot de passe existante).
 */

import nodemailer, { type Transporter } from 'nodemailer'
import { getSmtpCredentials } from '@/lib/server-config'

let cachedTransporter: Transporter | null = null
let cachedConfigKey = ''

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

/**
 * Résout la configuration SMTP : base de données (Paramètres → Serveur)
 * puis variables d'environnement. Null si aucune n'est complète.
 */
export async function resolveSmtpConfig(): Promise<SmtpConfig | null> {
  const creds = await getSmtpCredentials()
  if (!creds) return null
  return {
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    user: creds.user,
    pass: creds.pass,
    from: creds.from,
  }
}

/** True si un serveur SMTP est configuré (BDD ou env, serveur uniquement). */
export async function isEmailConfigured(): Promise<boolean> {
  return (await resolveSmtpConfig()) !== null
}

function getTransporter(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user}`
  if (cachedTransporter && cachedConfigKey === key) return cachedTransporter
  cachedConfigKey = key
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  })
  return cachedTransporter
}

/** Enveloppe HTML partagée (simple, propre, compatible tous clients). */
function wrapEmail(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td style="font-size:20px;font-weight:700;color:#18181b;padding-bottom:8px;">DRAX IA</td></tr>
          <tr><td style="font-size:22px;font-weight:600;color:#18181b;padding-bottom:16px;">${title}</td></tr>
          <tr><td style="font-size:15px;line-height:1.6;color:#3f3f46;">${bodyHtml}</td></tr>
          <tr><td style="padding-top:24px;font-size:12px;color:#a1a1aa;border-top:1px solid #e4e4e7;">
            Vous n'êtes pas à l'origine de cette demande ? Ignorez cet e-mail, aucun code ne sera utilisé.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

/** Envoie le code à 6 chiffres pour connexion / inscription. */
export async function sendOtpEmail(email: string, code: string, isNewAccount: boolean): Promise<void> {
  const config = await resolveSmtpConfig()
  if (!config) throw new Error('SMTP non configuré')

  const minutes = 10
  const title = isNewAccount
    ? 'Votre code pour créer votre compte'
    : 'Votre code de connexion'
  const body = `
    <p>Bonjour,</p>
    <p>Voici votre code à 6 chiffres${isNewAccount ? ' pour finaliser votre inscription' : ' pour vous connecter'} :</p>
    <p style="margin:20px 0;text-align:center;">
      <span style="display:inline-block;background:#18181b;color:#ffffff;font-size:30px;letter-spacing:10px;font-weight:700;border-radius:12px;padding:14px 22px;">${code}</span>
    </p>
    <p>Ce code est valable <strong>${minutes} minutes</strong> et à usage unique. Ne le partagez avec personne.</p>`

  const transporter = getTransporter(config)
  await transporter.sendMail({
    from: config.from,
    to: email,
    subject: `${title} — DRAX IA`,
    text: `DRAX IA — ${title}\n\nCode : ${code}\n\nValable ${minutes} minutes, à usage unique. Ne le partagez avec personne.`,
    html: wrapEmail(title, body),
  })
}

/** Envoie un e-mail de test (Paramètres → Serveur → « Tester l'envoi réel »).
 * Contient un code à 6 chiffres d'exemple pour vérifier la réception dans la boîte. */
export async function sendTestEmail(to: string): Promise<void> {
  const config = await resolveSmtpConfig()
  if (!config) throw new Error('SMTP non configuré')

  const demoCode = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
  const title = 'Test d’envoi — configuration réussie'
  const body = `
    <p>Félicitations, votre serveur DRAX IA envoie désormais de <strong>vrais e-mails</strong>.</p>
    <p>Exemple de rendu d’un code de connexion :</p>
    <p style="margin:20px 0;text-align:center;">
      <span style="display:inline-block;background:#18181b;color:#ffffff;font-size:30px;letter-spacing:10px;font-weight:700;border-radius:12px;padding:14px 22px;">${demoCode}</span>
    </p>
    <p>Ce code est un exemple (test) : il ne permet pas de se connecter.</p>`

  const transporter = getTransporter(config)
  await transporter.sendMail({
    from: config.from,
    to,
    subject: `${title} — DRAX IA`,
    text: `DRAX IA — ${title}\n\nLe serveur envoie de vrais e-mails. Code d'exemple : ${demoCode}`,
    html: wrapEmail(title, body),
  })
}

/** Envoie le lien de réinitialisation de mot de passe (existant). */
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const config = await resolveSmtpConfig()
  if (!config) throw new Error('SMTP non configuré')

  const body = `
    <p>Bonjour,</p>
    <p>Vous avez demandé la réinitialisation de votre mot de passe DRAX IA.</p>
    <p style="margin:20px 0;text-align:center;">
      <a href="${resetUrl}" style="background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;border-radius:10px;padding:12px 24px;display:inline-block;">Définir un nouveau mot de passe</a>
    </p>
    <p>Ce lien est valable <strong>1 heure</strong>. S'il ne fonctionne pas, copiez-collez-le :</p>
    <p style="word-break:break-all;font-size:13px;color:#52525b;">${resetUrl}</p>`

  const transporter = getTransporter(config)
  await transporter.sendMail({
    from: config.from,
    to: email,
    subject: 'Réinitialisation de votre mot de passe — DRAX IA',
    text: `DRAX IA — Réinitialisation du mot de passe\n\nOuvrez ce lien (valable 1 h) : ${resetUrl}`,
    html: wrapEmail('Réinitialisation du mot de passe', body),
  })
}
