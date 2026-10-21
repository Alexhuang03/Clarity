import { createClient } from "@/lib/supabase/server";
import { AUDIO_MIME, IMAGE_MIME, sniffAudio, sniffImage } from "@/lib/annotations/sniff";
import type { CustomEmote } from "@/lib/annotations/lol";

const BUCKET = "emotes";
const IMAGE_MAX = 2 * 1024 * 1024;
const SOUND_MAX = 1024 * 1024;
const NAME_MAX = 40;

const fail = (error: string, status = 400) => Response.json({ error }, { status });

/**
 * Importe une émote : nom, image (PNG, JPEG, GIF ou WebP, 2 Mo max) et son facultatif (OGG, MP3 ou WAV, 1 Mo max).
 * Passe par une route plutôt qu'une Server Action, limitée à 1 Mo par requête.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return fail("Non connecté.", 401);
  const userId = auth.claims.sub;

  // Refusée avant d'être lue en mémoire si elle est manifestement trop grosse
  if (Number(request.headers.get("content-length") ?? 0) > IMAGE_MAX + SOUND_MAX + 64 * 1024) {
    return fail("Fichiers trop lourds (image 2 Mo, son 1 Mo au maximum).", 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Envoi invalide.");
  }

  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!name || name.length > NAME_MAX) return fail(`Donne un nom de 1 à ${NAME_MAX} caractères.`);

  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) return fail("Choisis une image.");
  if (image.size > IMAGE_MAX) return fail("L'image dépasse 2 Mo.");
  const imageBytes = new Uint8Array(await image.arrayBuffer());
  const imageType = sniffImage(imageBytes);
  if (!imageType) return fail("Image non reconnue : PNG, JPEG, GIF ou WebP uniquement.");

  const sound = form.get("sound");
  let soundBytes: Uint8Array | null = null;
  let soundType: ReturnType<typeof sniffAudio> = null;
  if (sound instanceof File && sound.size > 0) {
    if (sound.size > SOUND_MAX) return fail("Le son dépasse 1 Mo.");
    soundBytes = new Uint8Array(await sound.arrayBuffer());
    soundType = sniffAudio(soundBytes);
    if (!soundType) return fail("Son non reconnu : OGG, MP3 ou WAV uniquement.");
  }

  const { count } = await supabase.from("custom_emotes").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= 30) return fail("Tu as atteint la limite de 30 émotes importées. Supprimes-en une d'abord.");

  const id = crypto.randomUUID();
  const imagePath = `${userId}/${id}/image.${imageType}`;
  const soundPath = soundType ? `${userId}/${id}/sound.${soundType}` : null;
  const storage = supabase.storage.from(BUCKET);

  const uploads = [storage.upload(imagePath, imageBytes, { contentType: IMAGE_MIME[imageType] })];
  if (soundPath && soundBytes && soundType) uploads.push(storage.upload(soundPath, soundBytes, { contentType: AUDIO_MIME[soundType] }));
  const results = await Promise.all(uploads);
  const cleanup = () => storage.remove([imagePath, ...(soundPath ? [soundPath] : [])]);
  if (results.some((r) => r.error)) {
    await cleanup();
    console.error("Import d'émote : envoi échoué", results.map((r) => r.error?.message));
    return fail("L'envoi des fichiers a échoué. Réessaie.", 500);
  }

  const { error } = await supabase.from("custom_emotes").insert({
    id,
    name,
    image_path: imagePath,
    image_type: imageType,
    sound_path: soundPath,
    sound_type: soundType,
  });
  if (error) {
    await cleanup();
    // Limite atteinte entre-temps (déclencheur en base)
    if (error.code === "P0001") return fail("Tu as atteint la limite de 30 émotes importées.");
    console.error("Import d'émote : enregistrement échoué", error.message);
    return fail("L'enregistrement a échoué. Réessaie.", 500);
  }

  const emote: CustomEmote = { id, name, hasSound: !!soundPath };
  return Response.json({ emote });
}
