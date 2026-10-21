// Sons des pings et des émotes, adapté du SoundBank de lolPing (MIT) :
// les sons sont décodés une fois puis rejoués sans latence (Web Audio).

const VOLUME_KEY = "clarity-lol-volume";
const MAX_VOICES = 8;

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let voices = 0;

/** Volume des sons, de 0 (muet) à 1. Préférence du navigateur, 0,5 par défaut. */
export function getVolume(): number {
  try {
    const value = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) === null || Number.isNaN(value) ? 0.5 : Math.min(Math.max(value, 0), 1);
  } catch {
    return 0.5;
  }
}

export function setVolume(volume: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Stockage indisponible : le réglage ne sera simplement pas retenu
  }
}

function load(url: string) {
  if (!buffers.has(url)) {
    buffers.set(
      url,
      fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((data) => ctx!.decodeAudioData(data))
        .catch(() => null),
    );
  }
  return buffers.get(url)!;
}

/** Joue un son (chargé la première fois). Sans effet si le volume est à 0 ou si le son est introuvable. */
export async function playSound(url: string, gain = 1) {
  const volume = getVolume() * gain;
  if (volume <= 0 || voices >= MAX_VOICES) return;
  // Le navigateur n'autorise le son qu'après une action de l'utilisateur : contexte créé au premier son
  ctx ??= new AudioContext({ latencyHint: "interactive" });
  if (ctx.state !== "running") void ctx.resume();
  const buffer = await load(url);
  if (!buffer) return;
  const source = ctx.createBufferSource();
  const amp = ctx.createGain();
  source.buffer = buffer;
  amp.gain.value = volume;
  source.connect(amp).connect(ctx.destination);
  voices++;
  source.onended = () => voices--;
  source.start();
}
