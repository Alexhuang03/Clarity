"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_PINGS,
  DEFAULT_EMOTE_WHEEL,
  DEFAULT_PINGS,
  EMOTES,
  PING_ACTIONS,
  WHEEL_SLOTS,
  customEmoteRef,
  emoteView,
  pingById,
  pingIconUrl,
  pingSoundUrl,
  type CustomEmote,
  type PingAction,
  type PingId,
} from "@/lib/annotations/lol";
import { DEFAULT_VOLUME, normalizeWheel, type LolPrefs } from "@/lib/annotations/prefs";
import { playSound, setVolume } from "@/lib/annotations/sound";
import { PING_LABELS } from "@/components/annotations/wheel";
import { deleteCustomEmote, saveLolPrefs } from "./lol-actions";

type Status = { kind: "saving" | "saved" | "error"; text: string } | null;

const IMAGE_MAX = 2 * 1024 * 1024;
const SOUND_MAX = 1024 * 1024;
const CUSTOM_MAX = 30;

const card = "rounded-2xl border border-black/10 p-6 dark:border-white/15";
const smallButton =
  "rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10";

/** Personnalisation façon lolPing : ping de chaque action, roue d'émotes, émotes importées et son. */
export function LolSettings({ initial }: { initial: LolPrefs }) {
  const [pings, setPings] = useState(initial.pings);
  const [wheel, setWheel] = useState(initial.wheel);
  const [customs, setCustoms] = useState(initial.customEmotes);
  const [volume, setVolumeState] = useState(initial.volume);
  const [muted, setMuted] = useState(initial.muted);
  const [status, setStatus] = useState<Status>(null);

  // Les aperçus sonores de cette page suivent le réglage en cours
  useEffect(() => setVolume(muted ? 0 : volume), [volume, muted]);

  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  async function save(patch: Parameters<typeof saveLolPrefs>[0]) {
    clearTimeout(statusTimer.current);
    setStatus({ kind: "saving", text: "Enregistrement…" });
    const result = await saveLolPrefs(patch);
    setStatus(result.error ? { kind: "error", text: result.error } : { kind: "saved", text: "Enregistré" });
    if (!result.error) statusTimer.current = setTimeout(() => setStatus(null), 1500);
  }

  return (
    <div className="space-y-6">
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2" aria-live="polite">
        {status && (
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-lg ${
              status.kind === "error" ? "bg-red-600 text-white" : "bg-[var(--background)] ring-1 ring-black/10 dark:ring-white/15"
            }`}
          >
            {status.kind === "saved" ? "✓ " : ""}
            {status.text}
          </span>
        )}
      </div>

      <PingSection
        pings={pings}
        onChange={(next) => {
          setPings(next);
          void save({ pings: next });
        }}
      />

      <EmoteWheelSection
        wheel={wheel}
        customs={customs}
        onChange={(next) => {
          setWheel(next);
          void save({ wheel: next });
        }}
      />

      <CustomEmotesSection
        customs={customs}
        onAdded={(emote) => setCustoms((list) => [...list, emote])}
        onDeleted={(id) => {
          const rest = customs.filter((c) => c.id !== id);
          setCustoms(rest);
          // Même correction que côté serveur : la case reprend une émote par défaut
          setWheel((w) => normalizeWheel(w, rest));
        }}
      />

      <SoundSection
        volume={volume}
        muted={muted}
        onVolume={setVolumeState}
        onVolumeCommit={(v) => void save({ volume: v })}
        onMuted={(m) => {
          setMuted(m);
          void save({ muted: m });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function PingSection({ pings, onChange }: { pings: Record<PingAction, PingId>; onChange: (p: Record<PingAction, PingId>) => void }) {
  const [action, setAction] = useState<PingAction>("question");
  const [note, setNote] = useState<string | null>(null);
  const isDefault = PING_ACTIONS.every((a) => pings[a] === DEFAULT_PINGS[a]);

  function choose(id: PingId) {
    const ping = pingById(id)!;
    void playSound(pingSoundUrl(ping.sound));
    if (pings[action] === id) return;
    // Un ping ne sert qu'à une action : s'il est déjà pris, les deux actions échangent leurs pings
    const owner = PING_ACTIONS.find((a) => a !== action && pings[a] === id);
    const next = { ...pings, [action]: id };
    if (owner) next[owner] = pings[action];
    setNote(owner ? `Échangé avec « ${PING_LABELS[owner]} », qui prend ${pingById(pings[action])!.label}.` : null);
    onChange(next);
  }

  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Pings des actions</h2>
          <p className="mt-1 text-sm opacity-70">
            L&apos;icône, le son et la couleur de chaque action de la roue (clic droit maintenu ou Alt + glisser).
          </p>
        </div>
        <button
          type="button"
          className={smallButton}
          disabled={isDefault}
          onClick={() => {
            setNote(null);
            onChange({ ...DEFAULT_PINGS });
          }}
        >
          Par défaut
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Action à modifier">
        {PING_ACTIONS.map((a) => {
          const ping = pingById(pings[a])!;
          const selected = a === action;
          return (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setAction(a);
                setNote(null);
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2 text-xs font-medium transition ${
                selected ? "bg-black/5 dark:bg-white/10" : "border-transparent hover:bg-black/5 dark:hover:bg-white/5"
              }`}
              style={selected ? { borderColor: ping.color } : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- icône de ping */}
              <img src={pingIconUrl(ping.icon)} alt="" className="h-9 w-9" />
              <span className="text-center leading-tight">{PING_LABELS[a]}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide opacity-50">Ping pour « {PING_LABELS[action]} »</p>
      <div className="mt-2 grid grid-cols-4 gap-2 rounded-xl bg-[#0a1016] p-3 sm:grid-cols-6">
        {ALL_PINGS.map((ping) => {
          const selected = pings[action] === ping.id;
          const owner = PING_ACTIONS.find((a) => a !== action && pings[a] === ping.id);
          return (
            <button
              key={ping.id}
              type="button"
              onClick={() => choose(ping.id)}
              title={`${ping.label}${owner ? ` (utilisé par « ${PING_LABELS[owner]} »)` : ""}`}
              aria-pressed={selected}
              className={`group relative flex flex-col items-center gap-1 rounded-lg p-1.5 text-[0.65rem] leading-tight text-[#c8aa6e] transition ${
                selected ? "bg-white/10 ring-2" : "hover:bg-white/5"
              }`}
              style={selected ? ({ "--tw-ring-color": ping.color } as React.CSSProperties) : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- icône de ping */}
              <img
                src={pingIconUrl(ping.icon)}
                alt=""
                className={`h-10 w-10 transition ${selected ? "scale-110" : owner ? "opacity-40" : "grayscale-[.6] group-hover:grayscale-0"}`}
                style={selected ? { filter: `drop-shadow(0 0 6px ${ping.color})` } : undefined}
              />
              <span className="text-center">{ping.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 min-h-4 text-xs opacity-60">{note ?? "Clique sur un ping pour l'entendre et le choisir."}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

function EmoteWheelSection({ wheel, customs, onChange }: { wheel: string[]; customs: CustomEmote[]; onChange: (w: string[]) => void }) {
  const [slot, setSlot] = useState(0);
  const views = useMemo(() => wheel.map((ref) => emoteView(ref, customs)), [wheel, customs]);
  const isDefault = wheel.every((ref, i) => ref === DEFAULT_EMOTE_WHEEL[i]);
  const catalogue = useMemo(
    () => [
      ...customs.map((c) => emoteView(customEmoteRef(c.id), customs)!),
      ...EMOTES.map((e) => emoteView(e.slug, customs)!),
    ],
    [customs],
  );

  function place(ref: string) {
    const view = emoteView(ref, customs);
    if (view?.sound) void playSound(view.sound);
    const next = [...wheel];
    // Déjà dans la roue : les deux cases échangent leurs émotes
    const from = next.indexOf(ref);
    if (from !== -1) next[from] = next[slot];
    next[slot] = ref;
    if (next.some((r, i) => r !== wheel[i])) onChange(next);
    setSlot((s) => (s + 1) % WHEEL_SLOTS);
  }

  const size = 248;
  const radius = 92;
  const item = 52;

  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Roue d&apos;émotes</h2>
          <p className="mt-1 text-sm opacity-70">
            Les 8 réactions de la roue (Ctrl + glisser dans un cours). Choisis une case, puis une émote.
          </p>
        </div>
        <button type="button" className={smallButton} disabled={isDefault} onClick={() => onChange([...DEFAULT_EMOTE_WHEEL])}>
          Par défaut
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div
          className="relative shrink-0 rounded-full bg-[radial-gradient(#101a22,#0a1016)] ring-1 ring-[#463714]"
          style={{ width: size, height: size }}
          role="radiogroup"
          aria-label="Cases de la roue"
        >
          {views.map((view, i) => {
            const angle = ((-90 + i * 45) * Math.PI) / 180;
            const selected = i === slot;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Case ${i + 1} : ${view?.label ?? "vide"}`}
                title={view?.label}
                onClick={() => setSlot(i)}
                className={`absolute overflow-hidden rounded-full transition ${
                  selected ? "z-10 scale-110 ring-[3px] ring-[#f0e6d2]" : "ring-1 ring-[#785a28] hover:ring-[#c8aa6e]"
                }`}
                style={{
                  width: item,
                  height: item,
                  left: size / 2 + radius * Math.cos(angle) - item / 2,
                  top: size / 2 + radius * Math.sin(angle) - item / 2,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu d'émote */}
                {view && <img src={view.still} alt="" className="h-full w-full object-cover" draggable={false} />}
              </button>
            );
          })}
          <div className="absolute left-1/2 top-1/2 w-24 -translate-x-1/2 -translate-y-1/2 text-center text-[0.65rem] font-semibold uppercase leading-tight tracking-wide text-[#1fa9e0]">
            {views[slot]?.label ?? ""}
          </div>
        </div>

        <div className="w-full min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Émote pour la case {slot + 1}</p>
          <div className="mt-2 grid max-h-72 grid-cols-6 gap-1.5 overflow-y-auto rounded-xl bg-[#0a1016] p-2 sm:grid-cols-7">
            {catalogue.map((view) => {
              const at = wheel.indexOf(view.ref);
              return (
                <button
                  key={view.ref}
                  type="button"
                  onClick={() => place(view.ref)}
                  title={`${view.label}${view.custom ? " (importée)" : ""}${at !== -1 ? ` · case ${at + 1}` : ""}`}
                  aria-label={view.label}
                  className={`group relative aspect-square overflow-hidden rounded-full transition hover:scale-110 ${
                    at === slot ? "ring-[3px] ring-[#f0e6d2]" : at !== -1 ? "ring-2 ring-[#c8aa6e]/70" : view.custom ? "ring-1 ring-indigo-400/60" : ""
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniature, animée au survol */}
                  <img src={view.still} alt="" loading="lazy" className="h-full w-full object-cover group-hover:hidden" draggable={false} />
                  {/* eslint-disable-next-line @next/next/no-img-element -- animation chargée au survol */}
                  <img src={view.anim} alt="" loading="lazy" className="hidden h-full w-full object-cover group-hover:block" draggable={false} />
                  {at !== -1 && (
                    <span className="absolute bottom-0 right-0 rounded-full bg-[#0a1016] px-1 text-[0.55rem] font-bold text-[#c8aa6e]">{at + 1}</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs opacity-60">
            Survole une émote pour la voir bouger. Les émotes déjà dans la roue portent le numéro de leur case.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

function CustomEmotesSection({
  customs,
  onAdded,
  onDeleted,
}: {
  customs: CustomEmote[];
  onAdded: (e: CustomEmote) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [sound, setSound] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const soundInput = useRef<HTMLInputElement>(null);
  const full = customs.length >= CUSTOM_MAX;

  // Aperçu local de l'image choisie (libéré quand on en change ou qu'on quitte la page)
  const previewRef = useRef<string | null>(null);
  function showPreview(file: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    setPreview(previewRef.current);
  }
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function pickImage(file: File | undefined) {
    setError(null);
    if (!file || file.size > IMAGE_MAX) {
      setImage(null);
      showPreview(null);
      if (!file) return;
      if (imageInput.current) imageInput.current.value = "";
      return setError("L'image dépasse 2 Mo.");
    }
    setImage(file);
    showPreview(file);
    // Nom proposé à partir du nom du fichier
    if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 40));
  }

  function pickSound(file: File | undefined) {
    setError(null);
    if (!file) return setSound(null);
    if (file.size > SOUND_MAX) {
      if (soundInput.current) soundInput.current.value = "";
      return setError("Le son dépasse 1 Mo.");
    }
    setSound(file);
  }

  function previewSound() {
    if (!sound) return;
    const url = URL.createObjectURL(sound);
    void playSound(url).finally(() => setTimeout(() => URL.revokeObjectURL(url), 10_000));
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!image || !name.trim()) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const form = new FormData();
    form.set("name", name.trim());
    form.set("image", image);
    if (sound) form.set("sound", sound);
    try {
      const res = await fetch("/api/emotes", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { emote?: CustomEmote; error?: string };
      if (!res.ok || !data.emote) throw new Error(data.error ?? "L'import a échoué.");
      onAdded(data.emote);
      setInfo(`« ${data.emote.name} » ajoutée. Place-la dans ta roue juste au-dessus.`);
      setName("");
      setImage(null);
      showPreview(null);
      setSound(null);
      if (imageInput.current) imageInput.current.value = "";
      if (soundInput.current) soundInput.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'import a échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(emote: CustomEmote) {
    if (!window.confirm(`Supprimer « ${emote.name} » ?\nLes réactions posées avec cette émote seront supprimées aussi.`)) return;
    setError(null);
    setInfo(null);
    const result = await deleteCustomEmote(emote.id);
    if (result.error) return setError(result.error);
    onDeleted(emote.id);
    const n = result.removedReactions ?? 0;
    setInfo(`« ${emote.name} » supprimée${n ? `, ainsi que ${n} réaction${n > 1 ? "s" : ""}` : ""}.`);
  }

  return (
    <section className={card}>
      <h2 className="font-medium">Mes émotes</h2>
      <p className="mt-1 text-sm opacity-70">
        Importe tes propres images (PNG, GIF, WebP ou JPEG, 2 Mo max), avec un son si tu veux (OGG, MP3 ou WAV, 1 Mo max).
        Les GIF et WebP animés s&apos;animent.
      </p>

      {customs.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {customs.map((c) => {
            const view = emoteView(customEmoteRef(c.id), customs)!;
            return (
              <li key={c.id} className="flex items-center gap-2 rounded-xl border border-black/10 p-2 dark:border-white/15">
                {/* eslint-disable-next-line @next/next/no-img-element -- émote importée */}
                <img src={view.still} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                <span className="min-w-0 flex-1 truncate text-sm" title={c.name}>
                  {c.name}
                </span>
                {view.sound && (
                  <button type="button" onClick={() => void playSound(view.sound!)} className="opacity-60 hover:opacity-100" title="Écouter" aria-label={`Écouter ${c.name}`}>
                    🔊
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void remove(c)}
                  className="text-red-600 opacity-60 hover:opacity-100 dark:text-red-400"
                  title="Supprimer"
                  aria-label={`Supprimer ${c.name}`}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={upload} className="mt-4 space-y-3 rounded-xl bg-black/[0.03] p-4 dark:bg-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/10 text-xl dark:bg-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local avant import */}
            {preview ? <img src={preview} alt="Aperçu" className="h-full w-full object-cover" /> : "🖼️"}
          </div>
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block font-medium">Nom</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Ex. : Je n'y comprends rien"
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 outline-none focus:border-indigo-500 dark:border-white/20"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Image</span>
            <input
              ref={imageInput}
              type="file"
              accept="image/png,image/gif,image/webp,image/jpeg"
              onChange={(e) => pickImage(e.target.files?.[0])}
              className="w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-indigo-600 file:px-2 file:py-1 file:text-white"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 flex items-center gap-2 font-medium">
              Son <span className="font-normal opacity-60">(facultatif)</span>
              {sound && (
                <button type="button" onClick={previewSound} className="text-xs font-normal text-indigo-600 hover:underline dark:text-indigo-400">
                  Écouter
                </button>
              )}
            </span>
            <input
              ref={soundInput}
              type="file"
              accept="audio/ogg,audio/mpeg,audio/wav,.ogg,.mp3,.wav"
              onChange={(e) => pickSound(e.target.files?.[0])}
              className="w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-indigo-600 file:px-2 file:py-1 file:text-white"
            />
          </label>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {info && <p className="text-sm text-green-700 dark:text-green-400">{info}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs opacity-60">
            {customs.length}/{CUSTOM_MAX} émotes importées
          </span>
          <button
            type="submit"
            disabled={busy || full || !image || !name.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy ? "Import…" : full ? "Limite atteinte" : "Importer"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

function SoundSection({
  volume,
  muted,
  onVolume,
  onVolumeCommit,
  onMuted,
}: {
  volume: number;
  muted: boolean;
  onVolume: (v: number) => void;
  onVolumeCommit: (v: number) => void;
  onMuted: (m: boolean) => void;
}) {
  const percent = Math.round(volume * 100);
  // Enregistré une fois le curseur relâché (ou après une courte pause au clavier)
  const commitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function change(v: number) {
    onVolume(v);
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => onVolumeCommit(v), 400);
  }

  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Son</h2>
          <p className="mt-1 text-sm opacity-70">Volume des pings et des émotes. Le bouton 🔊 de la roue coupe aussi le son.</p>
        </div>
        <button type="button" className={smallButton} disabled={volume === DEFAULT_VOLUME && !muted} onClick={() => { change(DEFAULT_VOLUME); onMuted(false); }}>
          Par défaut
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => onMuted(!muted)}
          aria-pressed={muted}
          className={`${smallButton} w-28`}
        >
          {muted ? "🔇 Coupé" : "🔊 Activé"}
        </button>
        <label className={`flex min-w-48 flex-1 items-center gap-3 text-sm ${muted ? "opacity-40" : ""}`}>
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={percent}
            disabled={muted}
            onChange={(e) => change(Number(e.target.value) / 100)}
            className="flex-1 accent-indigo-600"
          />
          <span className="w-10 text-right tabular-nums">{percent} %</span>
        </label>
        <button type="button" className={smallButton} disabled={muted || volume === 0} onClick={() => void playSound(pingSoundUrl("Base"))}>
          Tester
        </button>
      </div>
    </section>
  );
}
