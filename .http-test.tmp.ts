import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

for (const l of fs.readFileSync("d:/projetsPerso/Clarity/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}
const BASE = "http://localhost:3125";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL_, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const users: string[] = [];
const password = "Test-" + crypto.randomUUID();
const SAME = { Origin: BASE, "Sec-Fetch-Site": "same-origin" };

async function newUser(tag: string) {
  const email = `teach-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const jar = new Map<string, string>();
  const ssr = createServerClient(URL_, PUB, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (c) => c.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error: se } = await ssr.auth.signInWithPassword({ email, password });
  if (se) throw se;
  return { id: data.user.id, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}

async function post(cookie: string | null, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}/api/teach`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return `${res.status} ${await res.text()}`;
}

const resetGlobal = () => admin.from("rate_limits_global").delete().eq("bucket", "teach:global:day");

async function deleteCourse(courseId: string) {
  const { data: c } = await admin.from("courses").select("user_id").eq("id", courseId).maybeSingle();
  if (!c) return;
  const { data: files } = await admin.storage.from("documents").list(`${c.user_id}/${courseId}`);
  if (files?.length) await admin.storage.from("documents").remove(files.map((f) => `${c.user_id}/${courseId}/${f.name}`));
  await admin.from("courses").delete().eq("id", courseId);
}

async function checks() {
  const a = await newUser("a");
  const topic = { topic: "Ohm law", level: "high school physics" };
  await resetGlobal();
  console.log("401 no cookie       ->", await post(null, topic));
  console.log("403 evil Origin     ->", await post(a.cookie, topic, { Origin: "https://evil.example" }));
  console.log("403 cross-site      ->", await post(a.cookie, topic, { "Sec-Fetch-Site": "cross-site" }));
  console.log("415 text/plain      ->", await post(a.cookie, JSON.stringify(topic), { "Content-Type": "text/plain" }));
  console.log("400 short topic     ->", await post(a.cookie, { topic: "ab" }));
  console.log("400 topic too long  ->", await post(a.cookie, { topic: "x".repeat(201) }));
  console.log("400 level not str   ->", await post(a.cookie, { topic: "Ohm law", level: 5 }));

  // 409 : une génération déjà en cours (insérée directement)
  const { data: c } = await admin.from("courses").insert({ user_id: a.id, title: "fake", origin: "web" }).select("id").single();
  const { data: d } = await admin
    .from("documents")
    .insert({ user_id: a.id, course_id: c!.id, filename: "f.md", mime_type: "text/markdown", storage_path: `${a.id}/${c!.id}/x.md`, status: "parsing" })
    .select("id")
    .single();
  await admin.from("course_web").insert({ course_id: c!.id, user_id: a.id, document_id: d!.id, topic: "fake", locale: "en" });
  console.log("409 in progress     ->", await post(a.cookie, topic, SAME));
  await admin.from("courses").delete().eq("id", c!.id);

  // 429 global : compteur global déjà à 5
  await admin.from("rate_limits_global").upsert({ bucket: "teach:global:day", window_start: new Date().toISOString(), hits: 5 });
  const g = await newUser("g");
  console.log("429 global          ->", await post(g.cookie, topic, SAME));
  const { data: rl } = await admin.from("rate_limits").select("bucket, hits").eq("user_id", g.id);
  console.log("   counters of that user:", JSON.stringify(rl));
  await resetGlobal();

  // 429 par utilisateur : 4e demande de la journée (compteur posé à 3)
  const p = await newUser("p");
  await admin.from("rate_limits").insert({ user_id: p.id, bucket: "llm:teach:day", window_start: new Date().toISOString(), hits: 3 });
  console.log("429 per-user day    ->", await post(p.cookie, topic, SAME));
  const { data: gl } = await admin.from("rate_limits_global").select("hits").eq("bucket", "teach:global:day");
  console.log("   global consumed by refused user:", JSON.stringify(gl));

  // 503 : file pleine. Utilisateurs distincts (une génération chacun) ; le compteur global est remis à zéro entre deux
  // demandes (base locale de test). Les cours sont supprimés tout de suite : la file les saute sans appeler l'IA.
  const created: string[] = [];
  let last = "";
  for (let i = 0; i < 12; i++) {
    const u = await newUser("q" + i);
    last = await post(u.cookie, { topic: "Ohm law " + i }, SAME);
    await resetGlobal();
    const id = last.match(/"courseId":"([0-9a-f-]+)"/)?.[1];
    if (!id) break;
    created.push(id);
    // Les suivants restent en attente : on les supprime dès la fin du test (le premier peut avoir commencé)
  }
  console.log(`503 queue full      -> after ${created.length} accepted:`, last);
  for (const id of created) await deleteCourse(id);
  console.log("   test courses deleted:", created.length);
}

async function real(topicText: string, level: string) {
  const a = await newUser("r");
  await resetGlobal();
  const t = Date.now();
  const r = await post(a.cookie, { topic: topicText, level }, SAME);
  console.log("POST ->", r);
  const courseId = r.match(/"courseId":"([0-9a-f-]+)"/)?.[1];
  if (!courseId) return;
  const { data: rl } = await admin.from("rate_limits").select("bucket, hits").eq("user_id", a.id);
  console.log("COUNTERS", JSON.stringify(rl));
  const { data: gl } = await admin.from("rate_limits_global").select("bucket, hits");
  console.log("GLOBAL", JSON.stringify(gl));
  while (Date.now() - t < 13 * 60_000) {
    const { data } = await admin.from("documents").select("status, progress, error").eq("course_id", courseId).single();
    if (data?.status === "ready" || data?.status === "error") {
      console.log("DOC", data);
      break;
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
  console.log("DURATION_S", ((Date.now() - t) / 1000).toFixed(0));
  const { data: web } = await admin.from("course_web").select("grounded, provider").eq("course_id", courseId).single();
  const { data: src } = await admin.from("course_web_sources").select("n, title, domain").eq("course_id", courseId).order("n");
  const { count } = await admin.from("chunks").select("id", { count: "exact", head: true }).eq("course_id", courseId).not("embedding", "is", null);
  const { data: msgs } = await admin.from("messages").select("content, model").eq("course_id", courseId).order("created_at");
  const { data: parts } = await admin.from("course_parts").select("title").eq("course_id", courseId).order("ordinal");
  console.log("WEB", web, "SOURCES", src?.length, src?.map((s) => `${s.n}:${s.title}`).join(" | "));
  console.log("CHUNKS", count, "PARTS", parts?.map((p) => p.title));
  msgs?.forEach((m, i) =>
    console.log(
      `chapter ${i + 1}: ${(m.content.match(/\[\d+\]/g) ?? []).length} citations, ${m.content.split(/\n\s*\n/).length} paragraphs, ${m.content.length} chars, URLs in text: ${(m.content.match(/https?:\/\//g) ?? []).length}, model ${m.model}`,
    ),
  );
  await deleteCourse(courseId);
  await resetGlobal();
}

const mode = process.argv[2];
(mode === "real" ? real(process.argv[3] ?? "Ohm law", process.argv[4] ?? "high school physics") : checks())
  .catch((e) => console.error("FAILED", e))
  .finally(async () => {
    for (const id of users) {
      const { data: cs } = await admin.from("courses").select("id").eq("user_id", id);
      for (const c of cs ?? []) await deleteCourse(c.id);
      await admin.auth.admin.deleteUser(id);
    }
    console.log("CLEANED users:", users.length);
  });
