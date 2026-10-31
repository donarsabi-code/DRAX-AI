# DRAX AI — Déploiement en production sur Vercel

Ce guide décrit le déploiement de **ce dépôt** (Next.js 16 + Prisma + PostgreSQL) sur Vercel. Suivez les étapes dans l'ordre. Le déploiement héberge le site et ses routes API ; la base de données et les fournisseurs IA/e-mail restent des services externes.

## 0. Ce qu'il faut préparer

- Un ordinateur avec accès à un terminal (Windows PowerShell, macOS ou Linux).
- Un compte [GitHub](https://github.com), un compte [Vercel](https://vercel.com) et un compte [Neon](https://neon.com).
- Node.js **22.x** et Bun **1.3.4** pour les commandes locales.
- Une clé API Z.ai pour activer le chat, les images et la transcription vocale. Sans cette clé, le site peut être déployé mais ces fonctions IA ne fonctionneront pas.

> **Important :** ne publiez jamais `.env`, une clé API, un mot de passe ou une URL PostgreSQL contenant un mot de passe dans GitHub. Le dépôt doit rester privé pendant le déploiement initial.

## 1. Décompresser et installer les outils

1. Décompressez `drax-ai-vercel.zip` dans un dossier, par exemple `drax-ai`.
2. Installez Node.js 22 LTS : <https://nodejs.org/>.
3. Installez Bun en suivant la documentation officielle : <https://bun.sh/docs/installation>.
4. Ouvrez un terminal **dans le dossier qui contient `package.json`** et vérifiez :

```bash
node --version
bun --version
```

Node doit afficher `v22.x` et Bun `1.3.4` (ou une version Bun 1.3.x compatible avec le lockfile).

Installez les dépendances :

```bash
bun install --frozen-lockfile
```

Si Bun indique que le lockfile doit être mis à jour, arrêtez-vous et vérifiez que vous utilisez bien le Bun demandé. Ne supprimez pas `bun.lock` pour contourner le problème.

## 2. Créer la base PostgreSQL sur Neon

1. Ouvrez <https://neon.com> et créez un projet PostgreSQL nommé `drax-ai`.
2. Choisissez une région proche de vos utilisateurs et de votre déploiement Vercel.
3. Dans le tableau de bord Neon, ouvrez **Connect** et copiez la chaîne de connexion PostgreSQL. Elle ressemble à `postgresql://UTILISATEUR:MOT_DE_PASSE@HOTE/BASE?sslmode=require`.
4. Conservez cette chaîne privée. Elle sera utilisée comme variable `DATABASE_URL`.

## 3. Configurer les variables locales et créer les tables

À la racine du projet, copiez `.env.example` vers `.env`, puis remplacez les valeurs d'exemple. Le fichier `.env` est ignoré par Git.

Variables minimales pour préparer la base :

```dotenv
DATABASE_URL="postgresql://...votre-vraie-chaine-neon..."
OTP_SECRET="votre-secret-aleatoire-de-64-caracteres-hexadecimaux"
```

Générez `OTP_SECRET` avec cette commande :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copiez le résultat dans `.env`. Gardez exactement le même secret dans Vercel et ne le changez pas à chaque déploiement.

Créez les tables :

```bash
bunx prisma db push
```

La commande doit se terminer sans erreur. Elle applique le schéma de `prisma/schema.prisma` à la base PostgreSQL indiquée dans `DATABASE_URL`. N'utilisez pas la base SQLite locale `prisma/dev.db` pour Vercel.

## 4. Ajouter le projet sur GitHub

1. Sur <https://github.com>, créez un nouveau dépôt nommé `drax-ai`.
2. Choisissez **Private**. Ne cochez pas l'option qui crée un README, un `.gitignore` ou une licence : le projet en contient déjà.
3. Dans le terminal, toujours à la racine du projet, exécutez :

```bash
git init
git add .
git status
git commit -m "Initial DRAX AI deployment"
git branch -M main
git remote add origin https://github.com/VOTRE-PSEUDO/drax-ai.git
git push -u origin main
```

Remplacez `VOTRE-PSEUDO` par votre identifiant GitHub. Avant `git commit`, vérifiez que `.env` n'apparaît **pas** dans `git status`.

## 5. Importer le dépôt dans Vercel

1. Connectez-vous à <https://vercel.com> avec GitHub.
2. Cliquez sur **Add New → Project**.
3. Sélectionnez le dépôt privé `drax-ai`, puis **Import**.
4. Laissez les réglages détectés automatiquement :
   - Framework Preset : **Next.js**
   - Root Directory : `./`
   - Build Command : `bun run build` (ou la commande détectée qui exécute le script `build` de `package.json`)
   - Output Directory : valeur par défaut Next.js (`.next`)
   - Install Command : `bun install --frozen-lockfile`
5. Dans **Environment Variables**, ajoutez les variables ci-dessous avant le premier déploiement.

### Variables obligatoires

| Nom | Valeur |
|---|---|
| `DATABASE_URL` | Chaîne PostgreSQL Neon complète, avec `sslmode=require` |
| `OTP_SECRET` | La clé aléatoire générée à l'étape 3 |
| `ZAI_API_KEY` | Votre clé API privée obtenue depuis le portail développeur Z.ai |
| `ZAI_BASE_URL` | `https://api.z.ai/api/paas/v4` |

Cochez **Production**, **Preview** et **Development** si vous souhaitez utiliser les mêmes valeurs dans ces environnements. Pour une vraie production, vous pouvez utiliser une base et des clés distinctes pour Preview.

### Variables optionnelles

| Nom | Valeur / utilité |
|---|---|
| `APP_URL` | URL publique exacte, par exemple `https://drax-ai.vercel.app`. Recommandée après avoir obtenu le domaine Vercel ; utile pour OAuth. |
| `AI_PROVIDER` | `openai-compatible` pour choisir un fournisseur compatible OpenAI pour le chat. |
| `OPENAI_API_KEY` | Clé du fournisseur compatible OpenAI. |
| `OPENAI_BASE_URL` | Par exemple `https://api.openai.com/v1` ; utilisez l'URL du fournisseur choisi. |
| `OPENAI_MODEL` | Identifiant exact du modèle choisi, par exemple `gpt-4o-mini`. |
| `SMTP_HOST` | Hôte SMTP ; pour Gmail : `smtp.gmail.com`. |
| `SMTP_PORT` | `587` pour STARTTLS ou `465` pour SSL selon le fournisseur. |
| `SMTP_USER` | Adresse ou identifiant SMTP. |
| `SMTP_PASS` | Mot de passe SMTP ou mot de passe d'application. |
| `SMTP_FROM` | Expéditeur, par exemple `DRAX AI <vous@gmail.com>`. |
| `GOOGLE_CLIENT_ID` | Client ID OAuth Google ; voir étape 8. |
| `GOOGLE_CLIENT_SECRET` | Client Secret OAuth Google ; voir étape 8. |

**Ne mettez jamais les secrets dans le code source.** Saisissez-les uniquement dans les variables d'environnement Vercel ou dans le `.env` local non commité.

6. Cliquez sur **Deploy** et attendez que le déploiement affiche **Ready**. Vercel attribue une adresse `https://....vercel.app`.
7. Ajoutez ensuite cette adresse exacte comme valeur de `APP_URL` dans Vercel, si vous utilisez OAuth, puis relancez un déploiement (**Deployments → dernier déploiement → Redeploy**).

## 6. Vérifier le site en ligne

Ouvrez l'adresse Vercel et vérifiez au minimum :

1. La page d'accueil s'affiche en HTTPS.
2. L'inscription et la connexion fonctionnent.
3. Le premier compte créé devient le propriétaire du serveur et peut accéder à **Paramètres → Serveur**.
4. Une conversation est créée et enregistrée après un échange IA.
5. Une image générée est consultable après génération.

Si l'inscription renvoie une erreur 500, vérifiez d'abord que `DATABASE_URL` pointe vers la bonne base et que `bunx prisma db push` a été exécuté avec succès.

## 7. Activer l'envoi réel des codes e-mail (facultatif)

Sans SMTP, le mode de démonstration peut afficher le code sur l'écran au lieu de l'envoyer. Pour activer l'e-mail réel avec Gmail :

1. Activez la validation en deux étapes sur le compte Google expéditeur.
2. Créez un mot de passe d'application : <https://myaccount.google.com/apppasswords>.
3. Dans Vercel → projet → **Settings → Environment Variables**, ajoutez `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` et `SMTP_FROM` avec les valeurs du tableau précédent.
4. Redéployez le projet.
5. Testez l'envoi depuis **Paramètres → Serveur** si cette fonction est proposée dans votre interface.

Un fournisseur SMTP transactionnel (par exemple Brevo ou Mailgun) peut également être utilisé avec ses propres paramètres SMTP.

## 8. Activer « Se connecter avec Google » (facultatif)

1. Ouvrez <https://console.cloud.google.com/> et créez ou sélectionnez un projet Google Cloud.
2. Configurez l'écran de consentement OAuth. Si l'application est en mode **Testing**, ajoutez les adresses autorisées dans les utilisateurs test.
3. Ouvrez **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Choisissez **Web application**.
5. Dans **Authorized JavaScript origins**, ajoutez :

```text
https://VOTRE-DOMAINE-VERCEL.vercel.app
```

6. Dans **Authorized redirect URIs**, ajoutez exactement :

```text
https://VOTRE-DOMAINE-VERCEL.vercel.app/api/auth/google/callback
```

7. Remplacez les deux valeurs d'exemple par le vrai domaine Vercel. Ajoutez le Client ID et le Client Secret dans Vercel sous `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`.
8. Définissez `APP_URL` sur la même origine HTTPS et redéployez.

Si vous ajoutez un domaine personnalisé plus tard, ajoutez également son origine et son URL de callback dans Google Cloud, mettez `APP_URL` à jour, puis redéployez.

## 9. Mises à jour ultérieures

Pour publier une modification :

```bash
git add .
git commit -m "Description de la modification"
git push origin main
```

Vercel lance automatiquement un nouveau déploiement à chaque push sur `main`. Les autres branches peuvent générer des déploiements Preview.

## 10. Dépannage

| Symptôme | Vérification / correction |
|---|---|
| Build échoué sur Vercel | Ouvrez **Deployments → Build Logs**. Vérifiez Node 22, Bun/lockfile, puis les variables utilisées au build. |
| `PrismaClientInitializationError` ou erreur DB | Vérifiez `DATABASE_URL`, le mot de passe, l'hôte Neon et que la base est accessible. |
| Tables ou relation inexistante | Relancez `bunx prisma db push` avec le `DATABASE_URL` de la bonne base. |
| « moteur IA non configuré » | Ajoutez `ZAI_API_KEY` et `ZAI_BASE_URL`, puis redéployez : le fichier de configuration IA est généré pendant le build. |
| Erreur IA 401/403 | Vérifiez que la clé Z.ai est valide et autorisée pour l'API utilisée. |
| Réponse IA interrompue / erreur 504 | Vérifiez les Function Logs et la durée d'exécution. Les routes chat/images demandent jusqu'à 300 secondes ; Vercel Hobby est limité à 300 secondes maximum. |
| Code e-mail affiché à l'écran | SMTP n'est pas configuré ou les identifiants SMTP sont incorrects. |
| Google `redirect_uri_mismatch` | L'URL de callback déclarée dans Google doit correspondre caractère par caractère à `https://VOTRE-DOMAINE/api/auth/google/callback`. |
| Images/avatars non conservés | Vérifiez que l'app utilise bien Vercel et `DATABASE_URL` ; sur Vercel, les données de fichiers sont enregistrées en base, pas sur le disque local éphémère. |

## Architecture et limites à connaître

- **Application :** Next.js App Router ; Vercel héberge les pages et les routes API Node.js.
- **Données :** PostgreSQL sur Neon via Prisma. La base n'est pas incluse dans le ZIP et doit être créée séparément.
- **IA :** Z.ai pour les fonctions chat, images et transcription vocale ; fournisseur compatible OpenAI optionnel pour le chat.
- **Fichiers :** le stockage Vercel est adapté pour écrire les images et avatars en base de données. Les images base64 augmentent la taille de la base : surveillez l'espace et les limites de votre offre Neon.
- **Durée :** les routes de chat et d'images déclarent une durée maximale de 300 secondes. Une fonction qui dépasse la limite Vercel de votre plan peut être interrompue.
- **Secrets :** les clés sont des variables serveur ; ne les préfixez jamais par `NEXT_PUBLIC_`.
- **Sauvegardes :** activez et vérifiez une stratégie de sauvegarde PostgreSQL dans Neon. Vercel n'est pas la sauvegarde de la base.

Le déploiement n'est considéré comme terminé qu'après les tests de l'étape 6. Le statut **Ready** confirme la publication, pas le bon fonctionnement de la base, des clés IA ou des e-mails.
