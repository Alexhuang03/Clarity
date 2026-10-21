import { createClient } from "@/lib/supabase/server";
import { AUDIO_MIME, IMAGE_MIME, type AudioType, type ImageType } from "@/lib/annotations/sniff";

/** Image ou son d'une émote importée. Réservé à son propriétaire (RLS sur la table et le stockage). */
export async function GET(_request: Request, ctx: RouteContext<"/api/emotes/[id]/[file]">) {
  const { id, file } = await ctx.params;
  if (file !== "image" && file !== "sound") return new Response(null, { status: 404 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new Response(null, { status: 401 });

  const { data: emote } = await supabase
    .from("custom_emotes")
    .select("image_path, image_type, sound_path, sound_type")
    .eq("id", id)
    .maybeSingle();
  const path = file === "image" ? emote?.image_path : emote?.sound_path;
  if (!emote || !path) return new Response(null, { status: 404 });

  const { data: blob } = await supabase.storage.from("emotes").download(path);
  if (!blob) return new Response(null, { status: 404 });

  const type = file === "image" ? IMAGE_MIME[emote.image_type as ImageType] : AUDIO_MIME[emote.sound_type as AudioType];
  return new Response(blob, {
    headers: {
      "Content-Type": type,
      // Une émote n'est jamais modifiée (réimporter crée un nouvel id) : le navigateur la garde en cache
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
