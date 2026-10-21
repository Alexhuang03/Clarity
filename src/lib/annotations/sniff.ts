// Reconnaît une image ou un son à ses premiers octets, jamais à son extension ni au type annoncé
// par le navigateur. Repris de lolPing (src/shared/imageSniff.ts et audioSniff.ts, licence MIT).

export type ImageType = "png" | "jpeg" | "gif" | "webp";
export type AudioType = "ogg" | "mp3" | "wav";

export const IMAGE_MIME: Record<ImageType, string> = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
export const AUDIO_MIME: Record<AudioType, string> = { ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav" };

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const startsWith = (b: Uint8Array, at: number, sig: readonly number[]) =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, 0, PNG)) return "png";
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, 0, ascii("GIF87a")) || startsWith(bytes, 0, ascii("GIF89a"))) return "gif";
  if (startsWith(bytes, 0, ascii("RIFF")) && startsWith(bytes, 8, ascii("WEBP"))) return "webp";
  return null;
}

export function sniffAudio(bytes: Uint8Array): AudioType | null {
  if (startsWith(bytes, 0, ascii("OggS"))) return "ogg";
  if (startsWith(bytes, 0, ascii("RIFF")) && startsWith(bytes, 8, ascii("WAVE"))) return "wav";
  if (startsWith(bytes, 0, ascii("ID3"))) return "mp3"; // une balise ID3v2, puis les trames
  // Une trame MPEG audio nue : 11 bits de synchronisation, puis une couche autre que « réservée »
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0) return "mp3";
  return null;
}
