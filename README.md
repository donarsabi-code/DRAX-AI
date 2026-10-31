> **Déploiement public sur Vercel :** suivez le guide détaillé [README-VERCEL.md](./README-VERCEL.md) pour configurer Neon, les variables d’environnement, GitHub et Vercel.

# DRAX IA — Guide de configuration serveur

Ce guide couvre la mise en **mode réel** des connexions d'authentification :
**Google OAuth**, **Apple OAuth** et **« Gmail + code »** (code à 6 chiffres envoyé
dans la vraie boîte e-mail).

> 💡 **Méthode recommandée : tout se fait depuis l'INTERFACE.**
> Créez le premier compte (il devient *propriétaire du serveur*), puis ouvrez
> **Dashboard → onglet « Serveur »** : les guides pas-à-pas, le champ de collage
> des clés et le bouton de test réel sont intégrés. Les clés sont stockées en
> base de données côté serveur, jamais renvoyées au navigateur.
>
> La méthode par variables d'environnement (ci-dessous) reste disponible et est
> utilisée automatiquement si la base ne contient rien.

---

## 1. « Gmail + code » — recevoir le code dans la vraie boîte e-mail

Sans configuration, les codes fonctionnent en **mode démo** (le code s'affiche à
l'écran). Pour l'envoi **réel**, le serveur utilise SMTP (nodemailer) :

### Avec un compte Gmail (5 minutes)

1. Sur le compte Google qui enverra les e-mails : activez la **validation en
   deux étapes** — <https://myaccount.google.com/security>
2. Créez un **mot de passe d'application** (16 caractères) —
   <https://myaccount.google.com/apppasswords>
   (le mot de passe habituel du compte ne fonctionne pas : Google l'exige ainsi)
3. Renseignez la configuration :

| Variable | Valeur |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `vous@gmail.com` |
| `SMTP_PASS` | le mot de passe d'application (16 caractères) |
| `SMTP_FROM` | `DRAX IA <vous@gmail.com>` (optionnel) |

4. Redémarrez le serveur **ou** enregistrez la même configuration dans
   **Dashboard → Serveur** (prise d'effet immédiate, sans redémarrage).
5. Dans **Dashboard → Serveur → « Tester l'envoi réel »**, recevez un e-mail de
   test contenant un code d'exemple : la chaîne complète est vérifiée.

### Avec un autre fournisseur SMTP

Toute boîte SMTP fonctionne (Brevo, Mailgun, SMTP2GO, votre hébergeur…) :
`SMTP_HOST`, `SMTP_PORT` (465 = SSL, 587 = STARTTLS), `SMTP_USER`, `SMTP_PASS`.

> Dès qu'un SMTP valide est présent, **tous** les parcours basculent
> automatiquement en envoi réel : code de connexion/inscription, e-mail de test,
> réinitialisation de mot de passe. Le mode démo disparaît.

---

## 2. Google OAuth

Les identifiants appartiennent à **votre** compte Google : personne ne peut les
créer à votre place (c'est une règle de sécurité de Google). Une fois créés,
la connexion s'active instantanément.

### Étapes exactes (≈ 5 minutes)

1. Ouvrez <https://console.cloud.google.com/> → créez un projet (ex. « DRAX IA »).
2. **API et services → Écran de consentement OAuth** → type *Externe* →
   renseignez le nom de l'application et un e-mail de contact → Enregistrer.
3. **Identifiants → Créer des identifiants → ID client OAuth → Application Web**.
4. Dans **URI de redirection autorisés**, ajoutez exactement :

   ```
   https://VOTRE-DOMAINE/api/auth/google/callback
   ```

   (en développement local : `http://localhost:3000/api/auth/google/callback` —
   l'URI exacte à copier est affichée dans **Dashboard → Serveur**)
5. Copiez les valeurs dans les variables :

| Variable | Contenu |
| --- | --- |
| `GOOGLE_CLIENT_ID` | se termine par `apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | commence par `GOCSPX-` |

6. Redémarrez le serveur **ou** enregistrez-les dans **Dashboard → Serveur**.
7. Sur l'écran de connexion, « Continuer avec Google » redirige désormais vers
   la vraie page Google, puis connecte (ou crée) le compte DRAX IA.

---

## 3. Apple OAuth (optionnel)

1. Compte développeur Apple (<https://developer.apple.com>) →
   **Identifiers → Services ID** (ex. `com.drax.ia.signin`) avec
   *Sign in with Apple* activé et l'URI de retour :
   `https://VOTRE-DOMAINE/api/auth/apple/callback`
2. **Keys → créer une clé** avec *Sign in with Apple* → notez `Key ID`
   et téléchargez le fichier `.p8`.
3. Variables : `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`,
   `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (contenu PEM complet de la clé `.p8`).

---

## 4. Mode démo vs mode réel — résumé

| Fonction | Sans configuration (démo) | Après configuration |
| --- | --- | --- |
| Code e-mail (connexion/inscription) | Code affiché à l'écran, clairement étiqueté | **Vrai e-mail** dans la boîte (TTL 10 min, usage unique) |
| Bouton Google | Encart « config. requise », aucun plantage | Redirection réelle vers Google puis session |
| Test de la chaîne | — | Bouton « Tester l'envoi réel » dans le Dashboard |

## 5. Qui peut configurer ?

Le **premier compte créé** sur le serveur en est le **propriétaire** : seul lui
accède à l'onglet **Serveur** du Dashboard (les autres comptes reçoivent un
message explicite). Les secrets sont stockés en base côté serveur, affichés
masqués (`xxxx••••••••xxxx`), et ne transitent jamais vers le navigateur après
l'enregistrement.

## 6. Dépannage

| Symptôme | Cause probable / solution |
| --- | --- |
| « L'envoi de l'e-mail a échoué côté serveur » | Mot de passe d'application incorrect, ou validation en deux étapes désactivée — régénérez le mot de passe d'application. |
| Google : `redirect_uri_mismatch` | L'URI enregistrée chez Google diffère de celle affichée dans Dashboard → Serveur — copiez exactement celle affichée. |
| Google : `access_blocked` (écran de test) | Dans l'écran de consentement, ajoutez votre adresse dans « Utilisateurs test » ou publiez l'application. |
| Le code n'arrive pas | Vérifiez les dossiers indésirables/spam ; testez avec « Tester l'envoi réel » ; vérifiez `SMTP_FROM`. |
