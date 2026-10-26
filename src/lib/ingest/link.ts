import "server-only";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import JSZip from "jszip";
import sharp from "sharp";
import TurndownService from "turndown";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { UserFacingError } from "./extract";

// Récupère un cours à partir d'un lien : fichier en ligne (PDF, Word, PowerPoint, image, texte),
// page web (texte principal converti en Markdown), Google Drive / Docs, Dropbox, GitHub.
// Le serveur va chercher l'adresse lui-même : les adresses du réseau local sont refusées
// (sinon un lien pourrait faire lire au serveur la box, Supabase ou d'autres services de la maison).

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 6;
const REQUEST_TIMEOUT_MS = 30_000;
const TOTAL_TIMEOUT_MS = 90_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Clarity/1.0; +outil de révision personnel)";
const LOGIN_MESSAGE =
  "Ce lien demande une connexion (ENT, Moodle, Drive privé…). Télécharge le fichier, puis ajoute-le avec le bouton +.";

export type FetchedLink = { data: Buffer; ext: string; mimeType: string; filename: string; finalUrl: string };

// ---------- Adresses interdites : réseau local, machine elle-même, adresses réservées ----------
const blocked = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
  blocked.addSubnet(address, prefix, "ipv6");
}

function isBlocked(address: string, family: number) {
  // Adresse IPv4 écrite en IPv6 (::ffff:192.168.1.1)
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return blocked.check(mapped, "ipv4");
  return blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

/**
 * Résolution DNS vérifiée au moment même de la connexion (et pas avant) :
 * un nom qui change d'adresse entre la vérification et la connexion ne passe pas.
 */
const safeLookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
  dns.lookup(hostname, { all: true, family: options?.family }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some((a) => isBlocked(a.address, a.family))) {
      return callback(Object.assign(new Error("Adresse locale refusée"), { code: "BLOCKED_ADDRESS" }));
    }
    if (options?.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}) as unknown as typeof dns.lookup;

function checkUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UserFacingError("Le lien doit commencer par https:// ou http://.");
  if (url.username || url.password) throw new UserFacingError("Les liens avec identifiant et mot de passe ne sont pas acceptés.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new UserFacingError("Ce lien utilise un port inhabituel : il n'est pas accepté.");
  // Adresse IP écrite en clair : Node s'y connecte sans résolution DNS, donc sans passer par safeLookup
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  const family = net.isIP(literal);
  if (family && isBlocked(literal, family)) {
    throw new UserFacingError("Adresse refusée : les liens vers le réseau local ne sont pas acceptés.");
  }
}

// ---------- Liens de partage connus : on vise directement le fichier ----------
function directUrl(url: URL): URL {
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname;
  const driveId = path.match(/^\/file\/d\/([\w-]+)/)?.[1] ?? (path === "/open" ? url.searchParams.get("id") : null);
  if (host === "drive.google.com" && driveId) return new URL(`https://drive.google.com/uc?export=download&id=${driveId}`);
  const doc = path.match(/^\/(document|presentation|spreadsheets)\/d\/([\w-]+)/);
  if (host === "docs.google.com" && doc) {
    return new URL(
      doc[1] === "presentation"
        ? `https://docs.google.com/presentation/d/${doc[2]}/export/pdf`
        : `https://docs.google.com/${doc[1]}/d/${doc[2]}/export?format=pdf`,
    );
  }
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
    const copy = new URL(url);
    copy.searchParams.set("dl", "1");
    return copy;
  }
  if (host === "github.com" && /^\/[^/]+\/[^/]+\/blob\//.test(path)) return new URL(url.href.replace("/blob/", "/raw/"));
  return url;
}

// ---------- Téléchargement (redirections suivies et revérifiées, taille et durée limitées) ----------
type Response = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

function request(url: URL, deadline: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        timeout: Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()),
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/pdf,*/*;q=0.8",
          "Accept-Language": "fr,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
        }
        if (Number(res.headers["content-length"]) > MAX_BYTES) {
          req.destroy();
          return reject(new UserFacingError("Fichier trop lourd (50 Mo max)."));
        }
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: Readable = res;
        if (encoding === "gzip") stream = res.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
        else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new UserFacingError("Fichier trop lourd (50 Mo max)."));
          } else chunks.push(chunk);
        });
        stream.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("Délai dépassé"), { code: "TIMEOUT" })));
    req.on("error", reject);
    req.end();
  });
}

async function download(start: URL): Promise<Response & { url: URL }> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    checkUrl(url);
    let res: Response;
    try {
      res = await request(url, deadline);
    } catch (error) {
      if (error instanceof UserFacingError) throw error;
      const code = (error as { code?: string }).code;
      if (code === "BLOCKED_ADDRESS") throw new UserFacingError("Adresse refusée : les liens vers le réseau local ne sont pas acceptés.");
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") throw new UserFacingError("Site introuvable : vérifie le lien.");
      if (code === "TIMEOUT") throw new UserFacingError("Le site ne répond pas. Réessaie plus tard.");
      throw new UserFacingError("Impossible de joindre le site.");
    }
    if (res.status >= 300 && res.status < 400) {
      url = new URL(String(res.headers.location), url);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new UserFacingError(LOGIN_MESSAGE);
    if (res.status === 404 || res.status === 410) throw new UserFacingError("Page introuvable (erreur 404) : vérifie le lien.");
    if (res.status >= 400) throw new UserFacingError(`Le site a refusé la demande (erreur ${res.status}).`);
    return { ...res, url };
  }
  throw new UserFacingError("Trop de redirections : ce lien n'aboutit pas.");
}

// ---------- Reconnaissance du contenu ----------
const startsWith = (b: Buffer, sig: string) => b.subarray(0, sig.length).toString("latin1") === sig;

function decodeText(body: Buffer, contentType: string) {
  const declared = contentType.match(/charset=([\w-]+)/i)?.[1] ?? body.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(declared ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function headerFilename(headers: http.IncomingHttpHeaders) {
  const value = String(headers["content-disposition"] ?? "");
  const encoded = value.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ""));
    } catch {
      /* nom mal encodé : on essaie l'autre forme */
    }
  }
  return value.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1]?.trim() ?? null;
}

/** Nom lisible, sans caractères gênants, avec la bonne extension. */
function cleanName(name: string, ext: string) {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
  return `${base || "document"}.${ext}`;
}

/** Texte principal d'une page web (sans menus ni publicités), en Markdown. */
function pageToMarkdown(html: string, url: URL) {
  const { document } = parseHTML(html);
  const loginForm = !!document.querySelector('input[type="password"]');
  const pageTitle = document.querySelector("title")?.textContent?.trim();
  const article = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
  const text = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length < 300) {
    throw new UserFacingError(
      loginForm
        ? LOGIN_MESSAGE
        : "Pas assez de texte sur cette page : elle s'affiche peut-être avec JavaScript ou demande une connexion. Télécharge le contenu, puis ajoute-le avec le bouton +.",
    );
  }
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  turndown.remove(["script", "style", "noscript", "iframe", "form", "button"]);
  // Formules (Wikipédia, cours en ligne) : on garde le LaTeX
  turndown.addRule("math", {
    filter: (node) => node.nodeName === "MATH",
    replacement: (_content, node) => {
      const tex = (node as Element).querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
      return tex ? `$${tex.replace(/^\{\\displaystyle\s*|\}$/g, "")}$` : (node.textContent ?? "");
    },
  });
  // Liens : on garde le texte, sans l'adresse (inutile pour réviser, et bruit pour la recherche)
  turndown.addRule("links", {
    filter: "a",
    replacement: (content) => content,
  });
  turndown.addRule("images", {
    filter: "img",
    replacement: (_content, node) => {
      const alt = (node as Element).getAttribute("alt") ?? "";
      // Image de formule : son texte alternatif est du LaTeX ; les autres images ne servent pas à l'IA
      return /\\[a-z]+|\{\\displaystyle/.test(alt) ? `$${alt.replace(/^\{\\displaystyle\s*|\}$/g, "")}$` : "";
    },
  });
  const title = (article?.title || pageTitle || url.hostname).trim();
  const markdown = `# ${title}\n\nSource : ${url.href}\n\n${turndown.turndown(article?.content ?? "")}`;
  return { title, markdown };
}

/** Page « fichier trop volumineux pour l'analyse antivirus » de Google Drive : le vrai lien est dans le formulaire. */
function driveConfirmUrl(html: string): URL | null {
  if (!/download-form|uc-download-link/.test(html)) return null;
  const { document } = parseHTML(html);
  const form = document.querySelector("#download-form");
  if (!form) return null;
  const action = new URL(form.getAttribute("action") ?? "", "https://drive.usercontent.google.com/");
  for (const input of form.querySelectorAll('input[type="hidden"]')) {
    action.searchParams.set(input.getAttribute("name") ?? "", input.getAttribute("value") ?? "");
  }
  return action;
}

/** Va chercher le lien et renvoie un fichier prêt pour la lecture habituelle (PDF, Word, image, Markdown...). */
export async function fetchLink(raw: string): Promise<FetchedLink> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UserFacingError("Ce n'est pas un lien valide.");
  }
  checkUrl(url);
  let res = await download(directUrl(url));
  let contentType = String(res.headers["content-type"] ?? "").toLowerCase();

  // Google Drive (gros fichier) : page de confirmation avant le téléchargement
  if (contentType.includes("text/html") && /google\.com$/.test(res.url.hostname)) {
    const confirm = driveConfirmUrl(decodeText(res.body, contentType));
    if (confirm) {
      res = await download(confirm);
      contentType = String(res.headers["content-type"] ?? "").toLowerCase();
    } else if (/accounts\.google\.com|ServiceLogin/.test(res.url.href + res.body.subarray(0, 4000).toString("latin1"))) {
      throw new UserFacingError("Ce fichier Google n'est pas partagé publiquement. Dans Google Drive : Partager → « Tous les utilisateurs disposant du lien ».");
    }
  }

  const { body } = res;
  const finalUrl = res.url.href;
  const named = headerFilename(res.headers) ?? decodeURIComponent(res.url.pathname.split("/").pop() || "");
  const file = (ext: string, mimeType: string, data = body): FetchedLink => ({ data, ext, mimeType, finalUrl, filename: cleanName(named || res.url.hostname, ext) });

  if (body.length === 0) throw new UserFacingError("Le lien ne renvoie rien.");
  if (startsWith(body, "%PDF")) return file("pdf", "application/pdf");
  if (startsWith(body, "\x89PNG")) return file("png", "image/png");
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return file("jpg", "image/jpeg");
  if (startsWith(body, "RIFF") && body.subarray(8, 12).toString("latin1") === "WEBP") return file("webp", "image/webp");
  if (startsWith(body, "GIF8")) return file("png", "image/png", await sharp(body).png().toBuffer());
  if (startsWith(body, "PK\x03\x04")) {
    const zip = await JSZip.loadAsync(body).catch(() => null);
    if (zip?.file("word/document.xml")) return file("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    if (zip?.file("ppt/presentation.xml")) return file("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    throw new UserFacingError("Archive non prise en charge : seuls les fichiers Word (.docx) et PowerPoint (.pptx) sont lus.");
  }
  const head = body.subarray(0, 1024).toString("latin1").trimStart().toLowerCase();
  if (contentType.includes("text/html") || head.startsWith("<!doctype html") || head.startsWith("<html")) {
    const { title, markdown } = pageToMarkdown(decodeText(body, contentType), res.url);
    return { data: Buffer.from(markdown, "utf-8"), ext: "md", mimeType: "text/markdown", finalUrl, filename: cleanName(title, "md") };
  }
  if (contentType.startsWith("text/") || /\.(md|markdown|txt)$/i.test(res.url.pathname)) {
    const markdown = /\.(md|markdown)$/i.test(res.url.pathname) || contentType.includes("markdown");
    return file(markdown ? "md" : "txt", markdown ? "text/markdown" : "text/plain", Buffer.from(decodeText(body, contentType), "utf-8"));
  }
  throw new UserFacingError(`Type de contenu non pris en charge (${contentType.split(";")[0] || "inconnu"}). Liens acceptés : PDF, Word, PowerPoint, images, texte, pages web.`);
}
