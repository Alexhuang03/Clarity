// Pings et émotes de League of Legends, repris du projet lolPing
// (https://github.com/darrenprx/lolPing, code sous licence MIT © 2026 Danrui Meng).
// Les icônes, sons et émotes sont © Riot Games : utilisation non commerciale de fan,
// voir THIRD_PARTY_NOTICES.md. Fichiers servis depuis public/lol/.

export type PingAction = "question" | "understanding" | "error" | "highlight";
export const PING_ACTIONS: readonly PingAction[] = ["question", "understanding", "error", "highlight"];

export type PingId =
  | "danger" | "push" | "omw" | "allin" | "assist" | "needvision" | "missing" | "enemyvision" | "generic"
  | "bait" | "visioncleared" | "missingflip";

/** icon : fichier de public/lol/pings (sans .png) · sound : fichier de public/lol/sounds (sans .wav) */
export type PingDef = { id: PingId; name: string; label: string; icon: string; sound: string; color: string };

/** Les 12 pings de lolPing (src/shared/pings.ts), avec leur nom français. */
export const ALL_PINGS: readonly PingDef[] = [
  { id: "missing", name: "Enemy Missing", label: "Ennemi disparu « ? »", icon: "png_enemymissing_128x128", sound: "MIA", color: "#f2c518" },
  { id: "missingflip", name: "Upside-down Missing", label: "« ¿ » à l'envers", icon: "enemy_missing_flipped", sound: "MIA", color: "#f2c518" },
  { id: "danger", name: "Danger", label: "Danger / Repli", icon: "pingwheel_retreatrender", sound: "SRP_12", color: "#ff3b55" },
  { id: "enemyvision", name: "Enemy Vision", label: "Vision ennemie", icon: "pingwheel_enemyvisionrender", sound: "AreaIsWarded", color: "#ff3b55" },
  { id: "visioncleared", name: "Vision Cleared", label: "Vision dégagée", icon: "pingwheel_visionclearedrender", sound: "SRP_6", color: "#2b80ff" },
  { id: "generic", name: "Generic", label: "Ping simple", icon: "pingwheel_basicpingrender", sound: "Base", color: "#2e8bff" },
  { id: "omw", name: "On My Way", label: "J'arrive", icon: "omw_cyan", sound: "OnMyWay", color: "#2e8bff" },
  { id: "push", name: "Push", label: "Pousser", icon: "pingwheel_pushrender", sound: "SRP_9", color: "#35d27a" },
  { id: "assist", name: "Assist Me", label: "Besoin d'aide", icon: "png_assist_me_128x128", sound: "ComeHere", color: "#35d27a" },
  { id: "needvision", name: "Need Vision", label: "Besoin de vision", icon: "mt11_18_vision", sound: "SRP_7", color: "#35d27a" },
  { id: "allin", name: "All In", label: "Tout donner", icon: "png_all_in", sound: "SRP_4", color: "#f2b320" },
  { id: "bait", name: "Bait", label: "Appât", icon: "pingwheel_baitrender", sound: "SRP_11", color: "#efbc12" },
];

/** Ping associé par défaut à chaque action de Clarity. */
export const DEFAULT_PINGS: Record<PingAction, PingId> = {
  question: "missing",
  error: "danger",
  understanding: "visioncleared",
  highlight: "generic",
};

export const pingById = (id: unknown): PingDef | undefined => ALL_PINGS.find((p) => p.id === id);

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

export const WHEEL_SLOTS = 8;

/** Émote importée par l'utilisateur (fichiers servis par /api/emotes/<id>/...) */
export type CustomEmote = { id: string; name: string; hasSound: boolean };

const CUSTOM_PREFIX = "u:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Une émote est désignée par son slug (émote LoL) ou par « u:<id> » (émote importée). */
export const customEmoteRef = (id: string) => `${CUSTOM_PREFIX}${id}`;
export const customEmoteId = (ref: string): string | null => {
  const id = ref.startsWith(CUSTOM_PREFIX) ? ref.slice(CUSTOM_PREFIX.length) : null;
  return id && UUID.test(id) ? id : null;
};

export const isEmote = (slug: unknown): slug is string => typeof slug === "string" && EMOTES.some((e) => e.slug === slug);
export const emoteLabel = (slug: string) => STUDY_MEANING[slug] ?? EMOTES.find((e) => e.slug === slug)?.name ?? slug;
export const emoteStillUrl = (slug: string) => `/lol/emotes/${slug}.png`;
export const emoteAnimUrl = (slug: string) => `/lol/emotes/${slug}.webp`;
export const emoteSoundUrl = (slug: string) => `/lol/emotes/${slug}.ogg`;

export type EmoteView = { ref: string; label: string; still: string; anim: string; sound: string | null; custom: boolean };

/** Ce qu'il faut pour afficher une émote (LoL ou importée). Null si elle n'existe pas (ou plus). */
export function emoteView(ref: string, customs: readonly CustomEmote[]): EmoteView | null {
  if (isEmote(ref)) {
    return { ref, label: emoteLabel(ref), still: emoteStillUrl(ref), anim: emoteAnimUrl(ref), sound: emoteSoundUrl(ref), custom: false };
  }
  const id = customEmoteId(ref);
  const custom = id ? customs.find((c) => c.id === id) : undefined;
  if (!custom) return null;
  // Une image importée peut être animée (GIF, WebP) : la même sert d'image fixe et d'animation
  const image = `/api/emotes/${custom.id}/image`;
  return { ref, label: custom.name, still: image, anim: image, sound: custom.hasSound ? `/api/emotes/${custom.id}/sound` : null, custom: true };
}
