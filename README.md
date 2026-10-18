# Clarity
Site web qui t'aide à réviser avec plus d'efficacité.

Tu uploades tes cours et tes exos, l'IA en fait un résumé détaillé comme pour un débutant, et tu peux
**sélectionner n'importe quel passage** pour le surligner, poser une question ou écrire ce que tu as
compris. Les questions s'affichent dans des bulles sur les côtés (ordinateur) ou s'ouvrent d'un tap
sur le passage souligné en pointillés (mobile).

## Stack (100 % gratuite)
- **Next.js 16** (App Router, TypeScript, Tailwind)
- **Supabase en local** (Docker) : Postgres + pgvector, authentification par code email, stockage des fichiers
- **IA gratuite** : Gemini Flash (lecture PDF/images, embeddings), Groq, modèles `:free` d'OpenRouter

## Lancer le projet
Prérequis : Node 20+, Docker Desktop démarré.

```bash
npm install
npx supabase start          # lance la base, l'auth, le stockage et la boîte mail de test
cp .env.example .env.local  # puis colle la PUBLISHABLE_KEY affichée par la commande précédente
npm run dev
```

- Application : http://localhost:3000
- Boîte mail de test (codes de connexion) : http://127.0.0.1:54324
- Supabase Studio (base de données) : http://127.0.0.1:54323

## Feuille de route
- [x] Étape 1 : projet, schéma de base de données, connexion par code à 6 chiffres
- [ ] Étape 2 : création de cours, upload (PDF, MD, TXT, DOCX, PPTX), extraction et découpage
- [ ] Étape 3 : couche IA multi-fournisseurs avec bascule automatique, plan du cours, résumé par partie avec sources
- [ ] Étape 4 : sélection → menu (surligner / question / ce que j'ai compris), bulles latérales, panneau mobile
- [ ] Étape 5 : statut « compris », réglages des modèles, rendu maths (KaTeX) et schémas (Mermaid)
