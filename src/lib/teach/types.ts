export type WebSource = { n: number; title: string; url: string; domain: string };

export type CourseWebSources = {
  origin: "web";
  grounded: boolean;
  provider: "google" | "wikipedia" | "none";
  sources: WebSource[];
  searchEntryPointHtml: string | null;
};

export const TEACH_TOPIC_MAX = 200;
export const TEACH_LEVEL_MAX = 60;
export const TEACH_GOAL_MAX = 300;
