# Clarity
Site web qui t'aide à réviser avec plus d'efficacité.

Tu uploades tes cours et tes exos, l'IA en fait un résumé détaillé comme pour un débutant, et tu peux
**sélectionner n'importe quel passage** pour le surligner, poser une question ou écrire ce que tu as
compris. Les questions s'affichent dans des bulles sur les côtés (ordinateur) ou s'ouvrent d'un tap
sur le passage souligné en pointillés (mobile).

## Stack (100 % gratuite)
- **Next.js 16** (App Router, TypeScript, Tailwind)
- **Supabase en local** (Docker) : Postgres + pgvector, authentification par code email, stockage des fichiers
- **IA gratuite** : Gemini Flash (lecture PDF/images, résumés, embeddings), Groq (questions rapides), OpenRouter en option

## Lancer le projet
Prérequis : Node 20+, Docker Desktop démarré.

```bash
npm install
npx supabase start          # lance la base, l'auth, le stockage et la boîte mail de test
cp .env.example .env.local  # puis colle la PUBLISHABLE_KEY affichée par la commande précédente
npm run dev
```

- Application : http://localhost:3000
- Boîte mail de test : http://127.0.0.1:54324 (utilisée si `[auth.email.smtp] enabled = false`)
- Envoi réel via Gmail : renseigner `SMTP_USER` / `SMTP_PASS` (mot de passe d'application) dans `supabase/.env.local`
- Supabase Studio (base de données) : http://127.0.0.1:54323

## Feuille de route
- [x] Étape 1 : projet, schéma de base de données, authentification complète
  (inscription email + mot de passe avec vérification par code, connexion, mot de passe oublié,
  page « Mon compte » : changement de mot de passe, suppression du compte et de toutes ses données)
- [x] Étape 2 : création de cours, upload (PDF, Word, PowerPoint, Markdown, texte, images), lecture des PDF par Gemini
  (formules en LaTeX, schémas décrits), découpage en extraits citables, embeddings
- [x] Étape 3 : couche IA multi-fournisseurs avec bascule automatique, plan des cours longs, résumé « débutant »
  par partie avec sources vérifiées et corrigés repliables, questions dans la conversation (recherche sémantique)
- [ ] Étape 4 : annotations
  - [x] 4a. Roue de pings LoL (clic droit maintenu + glisser, Alt + glisser, ou sélection) : surligner (4 couleurs),
    poser une question, ce que j'ai compris, signaler une erreur — vraies icônes et sons de pings ;
    roue d'émotes (Ctrl + glisser) pour réagir à un passage, autocollants dans la marge ;
    marques ancrées au texte (API CSS Custom Highlight). Assets de lolPing / Riot Games : voir THIRD_PARTY_NOTICES.md
  - [ ] 4b. Bulles de discussion dans les marges, réponses de l'IA, revérification des erreurs signalées
  - [x] 4c. Personnalisation dans « Mon compte » : ping de chaque action (12 pings), 8 émotes de la roue,
    émotes importées (image + son, 30 max), volume et son coupé (aussi depuis la roue)
  - [ ] 4d. Mobile (panneau du bas) et annotations qui se chevauchent
- [ ] Étape 5 : statut « compris », réglages des modèles, rendu maths (KaTeX) et schémas (Mermaid)
