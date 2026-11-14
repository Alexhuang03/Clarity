// Textes produits par le serveur dans le contenu des outils d'étude (titres, fiche en markdown, retours par défaut),
// dans la langue de l'utilisateur. Les messages d'erreur de l'API restent en français pour l'instant.
import type { Locale } from "@/lib/i18n/config";

type Texts = {
  quickPrefix: string;
  examPrefix: string;
  quizTitle: string;
  deckTitle: string;
  newDeck: string;
  sheetTitle: string;
  generalConcept: string;
  notGraded: string;
  perfect: string;
  review: (concepts: string) => string;
  sheet: { summary: string; keyConcepts: string; definitions: string; formulas: string; pitfalls: string; sources: string; page: (n: number) => string };
};

export const STUDY_TEXTS: Record<Locale, Texts> = {
  fr: {
    quickPrefix: "Test rapide",
    examPrefix: "Examen blanc",
    quizTitle: "Quiz",
    deckTitle: "Flashcards",
    newDeck: "Nouveau paquet",
    sheetTitle: "Fiche de révision",
    generalConcept: "Notion générale",
    notGraded: "Réponse non corrigée par l'IA.",
    perfect: "Sans faute, bravo !",
    review: (c) => `Notions à revoir : ${c}.`,
    sheet: { summary: "En bref", keyConcepts: "Notions clés", definitions: "Définitions", formulas: "Formules", pitfalls: "Pièges à éviter", sources: "Sources", page: (n) => `page ${n}` },
  },
  en: {
    quickPrefix: "Quick test",
    examPrefix: "Mock exam",
    quizTitle: "Quiz",
    deckTitle: "Flashcards",
    newDeck: "New deck",
    sheetTitle: "Revision sheet",
    generalConcept: "General concept",
    notGraded: "Answer not graded by the AI.",
    perfect: "No mistakes, well done!",
    review: (c) => `Concepts to review: ${c}.`,
    sheet: { summary: "In short", keyConcepts: "Key concepts", definitions: "Definitions", formulas: "Formulas", pitfalls: "Pitfalls to avoid", sources: "Sources", page: (n) => `page ${n}` },
  },
  zh: {
    quickPrefix: "快速测验",
    examPrefix: "模拟考试",
    quizTitle: "测验",
    deckTitle: "抽认卡",
    newDeck: "新卡组",
    sheetTitle: "复习卡",
    generalConcept: "综合知识点",
    notGraded: "AI 未批改此答案。",
    perfect: "全部正确，太棒了！",
    review: (c) => `需要复习的知识点：${c}。`,
    sheet: { summary: "概要", keyConcepts: "关键概念", definitions: "定义", formulas: "公式", pitfalls: "易错点", sources: "来源", page: (n) => `第 ${n} 页` },
  },
};
