// Titres et étiquettes imposés aux réponses de l'IA, déjà traduits : le modèle recopie mot pour mot ce qu'on
// lui écrit (un titre « ## 🎯 De quoi parle cette partie » restait en français dans un résumé en chinois).
// Les émojis de tête sont identiques dans toutes les langues (repère visuel stable).
import type { Locale } from "@/lib/i18n/config";

type SummaryTexts = {
  headings: { intro: string; notions: string; application: string; pitfalls: string; keyPoints: string };
  labels: {
    oneLine: string;
    why: string;
    definition: string;
    formula: string;
    example: string;
    examples: string;
    specialCases: string;
    link: string;
  };
  /** Mention d'un exemple qui ne vient pas des sources */
  addedExample: string;
  /** Mention d'une réponse hors des sources (chat, bulles) */
  outsideCourse: string;
  /** Étiquette de la réponse directe du chat */
  brief: string;
  /** Phrases creuses typiques à proscrire */
  filler: string[];
};

export const SUMMARY_TEXTS: Record<Locale, SummaryTexts> = {
  fr: {
    headings: {
      intro: "🎯 De quoi parle cette partie",
      notions: "📚 Les notions, une par une",
      application: "🧩 Comment ça s'applique",
      pitfalls: "⚠️ Pièges fréquents",
      keyPoints: "✅ À retenir",
    },
    labels: {
      oneLine: "En une phrase",
      why: "Pourquoi",
      definition: "Définition",
      formula: "Formule",
      example: "Exemple résolu",
      examples: "Exemples résolus",
      specialCases: "Cas particuliers",
      link: "Lien",
    },
    addedExample: "(exemple ajouté)",
    outsideCourse: "(hors de ton cours)",
    brief: "En bref :",
    filler: [
      "cette notion est essentielle",
      "joue un rôle clé",
      "il est important de bien comprendre",
      "dans de nombreux domaines",
      "nous allons voir",
      "voir le cours",
    ],
  },
  en: {
    headings: {
      intro: "🎯 What this part is about",
      notions: "📚 The concepts, one by one",
      application: "🧩 How it applies",
      pitfalls: "⚠️ Common pitfalls",
      keyPoints: "✅ Key takeaways",
    },
    labels: {
      oneLine: "In one sentence",
      why: "Why",
      definition: "Definition",
      formula: "Formula",
      example: "Worked example",
      examples: "Worked examples",
      specialCases: "Special cases",
      link: "Connection",
    },
    addedExample: "(added example)",
    outsideCourse: "(outside your course)",
    brief: "In short:",
    filler: [
      "this concept is essential",
      "plays a key role",
      "a fundamental concept",
      "it is important to understand",
      "in many fields",
      "let's explore",
      "in this section we will see",
    ],
  },
  zh: {
    headings: {
      intro: "🎯 本部分讲什么",
      notions: "📚 逐个理解知识点",
      application: "🧩 如何应用",
      pitfalls: "⚠️ 常见误区",
      keyPoints: "✅ 要点回顾",
    },
    labels: {
      oneLine: "一句话",
      why: "为什么",
      definition: "定义",
      formula: "公式",
      example: "例题详解",
      examples: "例题详解",
      specialCases: "特殊情况",
      link: "联系",
    },
    addedExample: "（补充示例）",
    outsideCourse: "（课程之外）",
    brief: "简而言之：",
    filler: ["这个概念非常重要", "起着关键作用", "在许多领域都有应用", "我们需要深入理解", "接下来我们将看到", "具有重要意义"],
  },
};
