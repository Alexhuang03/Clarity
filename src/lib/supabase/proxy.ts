import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "./cookie-options";

// Pages accessibles sans être connecté (un utilisateur connecté y est renvoyé vers l'accueil)
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password"];
// Pages accessibles à tous, connecté ou non (liens de partage, textes juridiques)
const OPEN_PATHS = ["/share/", "/legal/"];
// Pages ouvertes à l'adresse exacte (un préfixe ouvrirait aussi /legal-xxx)
const OPEN_EXACT = ["/legal"];

// Rafraîchit la session Supabase et redirige vers /login si l'utilisateur n'est pas connecté.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (OPEN_EXACT.includes(path) || OPEN_PATHS.some((p) => path.startsWith(p))) return response;
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!data?.claims && !isPublic) {
    // Une API répond « non connecté » plutôt que de renvoyer la page de connexion
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non connecté." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Après connexion, on revient sur la page demandée
    if (request.nextUrl.pathname !== "/") {
      url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }
  // Seulement pour l'affichage d'une page (GET/HEAD) : un appel de Server Action (POST, en-tête
  // next-action) fait juste après la connexion, depuis /login ou /signup, doit aboutir (ex. syncLocaleAfterLogin)
  const isPageNavigation =
    (request.method === "GET" || request.method === "HEAD") && !request.headers.has("next-action");
  if (data?.claims && isPublic && isPageNavigation) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
