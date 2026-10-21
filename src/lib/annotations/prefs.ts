import {
  ALL_PINGS,
  DEFAULT_EMOTE_WHEEL,
  DEFAULT_PINGS,
  PING_ACTIONS,
  WHEEL_SLOTS,
  customEmoteId,
  isEmote,
  pingById,
  type CustomEmote,
  type PingAction,
  type PingId,
} from "./lol";

/** Personnalisation des pings, des émotes et du son (réglée dans « Mon compte »). */
export type LolPrefs = {
  pings: Record<PingAction, PingId>;
  /** 8 émotes (slug LoL ou « u:<id> »), de haut dans le sens des aiguilles d'une montre */
  wheel: string[];
  volume: number;
  muted: boolean;
  customEmotes: CustomEmote[];
};

export const DEFAULT_VOLUME = 0.5;

export const DEFAULT_PREFS: LolPrefs = {
  pings: { ...DEFAULT_PINGS },
  wheel: [...DEFAULT_EMOTE_WHEEL],
  volume: DEFAULT_VOLUME,
  muted: false,
  customEmotes: [],
};

/**
 * Ping de chaque action. Une action sans ping valide garde son ping par défaut ;
 * deux actions ne partagent jamais le même ping (sinon on ne saurait plus les distinguer).
 */
export function normalizePings(value: unknown): Record<PingAction, PingId> {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const chosen: Partial<Record<PingAction, PingId>> = {};
  const used = new Set<PingId>();
  for (const action of PING_ACTIONS) {
    const ping = pingById(input[action]);
    if (ping && !used.has(ping.id)) {
      chosen[action] = ping.id;
      used.add(ping.id);
    }
  }
  // Actions sans choix valide : leur ping par défaut s'il est libre, sinon le premier ping libre
  for (const action of PING_ACTIONS) {
    if (chosen[action]) continue;
    const id = used.has(DEFAULT_PINGS[action]) ? ALL_PINGS.find((p) => !used.has(p.id))!.id : DEFAULT_PINGS[action];
    chosen[action] = id;
    used.add(id);
  }
  return chosen as Record<PingAction, PingId>;
}

/** Roue d'émotes : 8 émotes existantes et distinctes ; une case invalide reprend l'émote par défaut. */
export function normalizeWheel(value: unknown, customs: readonly CustomEmote[]): string[] {
  const input = Array.isArray(value) ? value : [];
  const valid = (ref: unknown): ref is string =>
    typeof ref === "string" && (isEmote(ref) || customs.some((c) => c.id === customEmoteId(ref)));
  const wheel: string[] = [];
  for (let i = 0; i < WHEEL_SLOTS; i++) {
    const ref = input[i];
    wheel.push(valid(ref) && !wheel.includes(ref) ? ref : "");
  }
  // Cases vides : les émotes par défaut pas encore utilisées, dans l'ordre
  const spare = DEFAULT_EMOTE_WHEEL.filter((slug) => !wheel.includes(slug));
  return wheel.map((ref) => ref || spare.shift()!);
}

export const normalizeVolume = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : DEFAULT_VOLUME;

export type SettingsRow = {
  ping_map?: unknown;
  emote_wheel?: unknown;
  sound_volume?: unknown;
  sound_muted?: unknown;
} | null;

export type CustomEmoteRow = { id: string; name: string; sound_path: string | null };

export function prefsFromRows(settings: SettingsRow, emotes: CustomEmoteRow[] | null): LolPrefs {
  const customEmotes = (emotes ?? []).map((e) => ({ id: e.id, name: e.name, hasSound: !!e.sound_path }));
  return {
    pings: normalizePings(settings?.ping_map),
    wheel: normalizeWheel(settings?.emote_wheel, customEmotes),
    volume: normalizeVolume(settings?.sound_volume),
    muted: settings?.sound_muted === true,
    customEmotes,
  };
}

/** Colonnes à lire pour construire les préférences. */
export const SETTINGS_COLUMNS = "ping_map, emote_wheel, sound_volume, sound_muted";
export const CUSTOM_EMOTE_COLUMNS = "id, name, sound_path";
