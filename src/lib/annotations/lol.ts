// Pings et émotes de League of Legends, repris du projet lolPing
// (https://github.com/darrenprx/lolPing, code sous licence MIT © 2026 Danrui Meng).
// Les icônes, sons et émotes sont © Riot Games : utilisation non commerciale de fan,
// voir THIRD_PARTY_NOTICES.md. Fichiers servis depuis public/lol/.

export type PingAction = "question" | "understanding" | "error" | "highlight";

export type PingDef = { id: string; name: string; icon: string; sound: string; color: string };

/** Le ping LoL associé à chaque action de Clarity (icône, son et couleur de lolPing). */
export const PINGS: Record<PingAction, PingDef> = {
  question: { id: "missing", name: "Enemy Missing", icon: "png_enemymissing_128x128", sound: "MIA", color: "#f2c518" },
  error: { id: "danger", name: "Danger", icon: "pingwheel_retreatrender", sound: "SRP_12", color: "#ff3b55" },
  understanding: { id: "visioncleared", name: "Vision Cleared", icon: "pingwheel_visionclearedrender", sound: "SRP_6", color: "#2b80ff" },
  highlight: { id: "generic", name: "Generic", icon: "pingwheel_basicpingrender", sound: "Base", color: "#2e8bff" },
};

/** Son joué quand le pointeur passe d'une part de la roue à une autre. */
export const TICK_SOUND = "button";

export const pingIconUrl = (icon: string) => `/lol/pings/${icon}.png`;
export const pingSoundUrl = (sound: string) => `/lol/sounds/${sound}.wav`;

export type EmoteDef = { slug: string; name: string };

/** Les 44 émotes de lolPing (catalogue généré par son outil d'extraction). */
export const EMOTES: readonly EmoteDef[] = [
  { slug: "facepalm", name: "Facepalm" },
  { slug: "unworthy", name: "Unworthy" },
  { slug: "unworthy_cn", name: "Unworthy (texte chinois)" },
  { slug: "poro_snax", name: "Poro Snax" },
  { slug: "sad_kitten", name: "Sad Kitten" },
  { slug: "cheeky_poro", name: "Cheeky Poro" },
  { slug: "angry_kitty", name: "Angry Kitty" },
  { slug: "gg_heart", name: "GG <3" },
  { slug: "bee_happy", name: "Bee Happy" },
  { slug: "bee_mad", name: "Bee Mad" },
  { slug: "bee_sad", name: "Bee Sad" },
  { slug: "snoozy_poro", name: "Snoozy Poro" },
  { slug: "wahaha", name: "Wahaha" },
  { slug: "omg_love_it", name: "OMG I love it" },
  { slug: "poro_ride", name: "Poro Ride" },
  { slug: "dont_make_me_laugh", name: "Don't Make Me Laugh" },
  { slug: "woah_dizzy", name: "Woah… Dizzy" },
  { slug: "haha_hilarious", name: "Haha HILARIOUS" },
  { slug: "gasp", name: "Gasp!" },
  { slug: "super_approved", name: "Super-Approved" },
  { slug: "pain", name: "PaiN…" },
  { slug: "laughing_out_loud", name: "Laughing Out LOUD" },
  { slug: "hats_off", name: "Hat's Off" },
  { slug: "call_me", name: "Call Me!" },
  { slug: "think_about_it", name: "Think About It" },
  { slug: "unimpressed", name: "Unimpressed!" },
  { slug: "did_you_just", name: "Did You Just?" },
  { slug: "nice_try", name: "Nice Try" },
  { slug: "nice", name: "Nice" },
  { slug: "despair", name: "Despair" },
  { slug: "does_not_compute", name: "Does Not Compute" },
  { slug: "come_at_me", name: "Come at Me" },
  { slug: "how_could_you", name: "How Could You" },
  { slug: "scout_approved", name: "Scout-Approved" },
  { slug: "maybe_next_time", name: "Maybe Next Time" },
  { slug: "okay", name: "Okay" },
  { slug: "good_job_buddy", name: "Good Job, Buddy!" },
  { slug: "teamwork", name: "Teamwork!" },
  { slug: "i_will_destroy_you", name: "I will destroy you" },
  { slug: "not_today", name: "Not Today!" },
  { slug: "oh", name: "Oh..." },
  { slug: "come_again", name: "Come again?" },
  { slug: "magpie_oopsie", name: "Magpie Oopsie" },
  { slug: "such_foolishness", name: "Such Foolishness" },
];

/** Ce que l'émote veut dire en révisant (libellé affiché au centre de la roue). */
const STUDY_MEANING: Record<string, string> = {
  does_not_compute: "Je ne comprends pas",
  think_about_it: "À méditer",
  super_approved: "Super clair !",
  gasp: "Waouh !",
  woah_dizzy: "Ça me donne le tournis",
  facepalm: "Évident en fait",
  come_again: "Hein ?",
  nice: "Bien vu",
};

/** Roue d'émotes par défaut, choisie pour réviser (de haut, dans le sens des aiguilles d'une montre). */
export const DEFAULT_EMOTE_WHEEL = [
  "does_not_compute",
  "think_about_it",
  "super_approved",
  "gasp",
  "woah_dizzy",
  "facepalm",
  "come_again",
  "nice",
] as const;

export const isEmote = (slug: unknown): slug is string => typeof slug === "string" && EMOTES.some((e) => e.slug === slug);
export const emoteLabel = (slug: string) => STUDY_MEANING[slug] ?? EMOTES.find((e) => e.slug === slug)?.name ?? slug;
export const emoteStillUrl = (slug: string) => `/lol/emotes/${slug}.png`;
export const emoteAnimUrl = (slug: string) => `/lol/emotes/${slug}.webp`;
export const emoteSoundUrl = (slug: string) => `/lol/emotes/${slug}.ogg`;
