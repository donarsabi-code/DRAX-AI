import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Sur Vercel, le fichier .z-ai-config (généré au build par
  // scripts/write-zai-config.mjs depuis les variables ZAI_API_KEY /
  // ZAI_BASE_URL) doit être inclus dans le bundle serverless : le SDK le
  // lit à l'exécution depuis le dossier courant. Fichier serveur uniquement —
  // jamais servi au navigateur.
  outputFileTracingIncludes: {
    "/api/**": ["./.z-ai-config"],
  },
};

export default nextConfig;
