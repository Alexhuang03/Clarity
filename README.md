# Clarity

**Comprendre ses cours, pas seulement les relire.**

Clarity est un site de révision assisté par IA. Tu importes tes cours et tes exercices, ou tu tapes simplement un
sujet. Clarity te rédige un résumé clair, partie par partie, répond à tes questions en citant ses sources, puis
t'entraîne jusqu'à ce que ce soit acquis.

🌐 En ligne : [clarity.alexhbh.com](https://clarity.alexhbh.com)

## Fonctionnalités

### Comprendre
- **Import de cours** : PDF, Word, PowerPoint, Markdown, texte, images et liens web. Les PDF sont lus par l'IA
  (formules en LaTeX, schémas décrits). Les équations, images, tableaux et notes du présentateur des fichiers
  Office sont conservés.
- **Résumés sourcés** : chaque partie du cours est expliquée notion par notion (définition, pourquoi, formule
  expliquée, exemple résolu, pièges). Chaque affirmation renvoie au passage exact du document. Trois niveaux de
  détail sont proposés : concis, détaillé, très détaillé.
- **Mode professeur** : dans un cours vide, tape un sujet (« le théorème de Thalès, niveau 3e »). Clarity cherche
  des sources sur le web, construit un plan et rédige un cours complet, avec citations [1] [2] et liste des sources.
- **Discussion sur le cours** : pose tes questions. L'IA répond à partir de tes documents (recherche sémantique)
  et affiche sa réflexion.
- **Annotations** : surligne, pose une question sur un passage, explique ce que tu as compris, signale une
  erreur. Les réponses de l'IA s'affichent en bulles dans la marge. Une roue de pings et d'émotes inspirée de
  League of Legends permet de réagir aux passages.

### S'entraîner
- **Quiz** (QCM, vrai/faux, réponses rédigées corrigées selon un barème) et **tests rapides** ciblés sur tes
  points faibles.
- **Examens blancs** chronométrés, avec remise automatique.
- **Flashcards** à répétition espacée (SM-2).
- **Fiches de révision** et **cartes mentales** générées depuis le cours.
- **Progression** : maîtrise par notion, série de jours, statistiques.

### Partager et personnaliser
- **Liens de partage** en lecture seule.
- **Trois langues** pour l'interface et les réponses de l'IA : français, anglais et chinois.
- Thème clair ou sombre, pings et émotes personnalisables (sons, émotes importées).

## Stack

| Domaine | Outils |
|---|---|
| Application | Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS v4 |
| Données | Supabase : Postgres + pgvector, Row Level Security, authentification par code e-mail, stockage, pg_cron |
| IA (offres gratuites) | Google Gemini (lecture, résumés, embeddings, recherche Google), Groq, OpenRouter, avec bascule automatique entre modèles |
| Sources web | Recherche Google via Gemini, API Wikipédia en secours |
| Hébergement | Serveur OVH, Cloudflare, pm2 |

## Sécurité

- Données isolées par utilisateur grâce aux politiques RLS de Postgres et à des triggers de propriété.
- Défense contre l'injection de prompt : les contenus importés et les pages web sont traités comme des données
  non fiables.
- Limites d'usage par utilisateur et pour tout le site, stockées en base.
- Validation stricte des requêtes, vérification de l'origine, en-têtes de sécurité et Content Security Policy.
- Clé secrète Supabase utilisée côté serveur uniquement.

## Lancer le projet en local

Prérequis : Node 22 recommandé (20 minimum), Docker Desktop démarré.

```bash
npm install
npx supabase start          # base, authentification, stockage et boîte mail de test
cp .env.example .env.local  # puis renseigne les clés (voir ci-dessous)
npm run dev
```

Variables de `.env.local` :

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Affichées par `npx supabase status` |
| `SUPABASE_SECRET_KEY` | Côté serveur uniquement : ne jamais la préfixer par `NEXT_PUBLIC_`, ne jamais la commiter |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` | Fournisseurs d'IA (au moins un requis, Gemini recommandé) |
| `NEXT_PUBLIC_SITE_URL` | URL publique en production (active HSTS et `upgrade-insecure-requests`) |

Adresses utiles en local :
- Application : http://localhost:3000
- Supabase Studio : http://127.0.0.1:54323
- Boîte mail de test : http://127.0.0.1:54324

## Mise en production

```bash
git pull
npx supabase migration up   # applique les nouvelles migrations, sans jamais lancer « db reset »
npm run build
pm2 restart clarity
```

Applique toujours les migrations **avant** de redémarrer le code qui en dépend. Le mode professeur et la
lecture des fichiers utilisent une file d'attente en mémoire : il faut **un seul** processus Node qui tourne en
continu.

## Droits d'auteur

© 2026 Alex Huang. Tous droits réservés.

Ce dépôt et son contenu (code source, design, textes, logo) ne sont pas sous licence libre. Toute reproduction,
modification, distribution ou réutilisation, totale ou partielle, est interdite sans autorisation écrite préalable.
Voir [LICENSE](LICENSE).

Les éléments tiers (bibliothèques open source, assets de lolPing et de Riot Games, composants React Bits) restent
la propriété de leurs auteurs et sont soumis à leurs propres licences : voir
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Clarity n'est pas approuvé par Riot Games et ne reflète pas les opinions de Riot Games ni de quiconque ayant
participé à la production ou à la gestion de ses propriétés.

## Auteur

**Alex Huang** · [github.com/Alexhuang03](https://github.com/Alexhuang03)
