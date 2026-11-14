"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import BlurText from "@/components/reactbits/BlurText";
import { GridBackground } from "@/components/ui/grid-background";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Reveal } from "@/components/ui/reveal";
import { Spotlight } from "@/components/ui/spotlight";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useT } from "@/lib/i18n/client";
import { LoginPanel } from "./login-panel";
import { SignupPanel } from "./signup-panel";

const GITHUB_URL = "https://github.com/Alexhuang03";

export type AuthTab = "login" | "signup";
/** Ancres de la carte du bas : #connexion et #inscription (liens directs possibles) */
const HASH: Record<AuthTab, string> = { login: "connexion", signup: "inscription" };

const icon = (d: React.ReactNode, className = "h-[18px] w-[18px]") => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {d}
  </svg>
);

// Même ordre que t.landing.features
const FEATURE_ICONS = [
  icon(<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h4" />),
  icon(<path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5" />),
  icon(
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
    </>,
  ),
  icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17h.01" />
    </>,
  ),
  icon(
    <>
      <rect x="3" y="6" width="14" height="12" rx="2" />
      <path d="M7 3h11a3 3 0 0 1 3 3v9" />
    </>,
  ),
  icon(
    <>
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="5" cy="5" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="m6.5 6.5 3.7 3.7M17.5 17.5l-3.7-3.7" />
    </>,
  ),
  icon(<path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />),
  icon(<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />),
  icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9M12 3C9.5 5.6 8.3 8.6 8.3 12s1.2 6.4 3.7 9" />
    </>,
  ),
];

const checkIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />, "h-4 w-4");
const sparkleIcon = icon(
  <path d="M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9L12 3Z" />,
  "h-4 w-4",
);

export function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Pastille de citation, comme dans un vrai résumé */
const Pill = ({ n }: { n: number }) => (
  <span className="mx-0.5 inline-flex h-4 min-w-4 -translate-y-px items-center justify-center rounded-full bg-indigo-500/15 px-1 align-middle text-[0.6rem] font-semibold leading-none text-indigo-700 dark:text-indigo-300">
    {n}
  </span>
);

/** Aperçu stylisé de l'application (HTML/CSS, décoratif) : un résumé sourcé, un quiz, la barre de question. */
function AppPreview() {
  const { t } = useT();
  const m = t.landing.mock;
  return (
    <div role="img" aria-label={t.landing.previewLabel} className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div aria-hidden className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-accent-soft blur-3xl" />
      <div aria-hidden className="overflow-hidden rounded-[1.4rem] border border-line bg-surface shadow-pop">
        {/* Barre du cours */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.course}</span>
          <span className="rounded-full border border-line px-2.5 py-0.5 text-[0.7rem] text-muted">{t.course.revise}</span>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground font-display text-[0.8rem] italic text-background">
              C
            </span>
            <span className="text-xs font-semibold">Clarity</span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-accent-text">{m.badge}</span>
          </div>
          <div className="rounded-xl border border-line bg-background/60 p-4">
            <p className="border-l-[3px] border-indigo-500 pl-2.5 text-sm font-semibold">{m.heading}</p>
            <p className="mt-3 text-[0.8rem] leading-6 text-muted">
              {m.line1}
              <Pill n={1} />. {m.line2}
              <Pill n={2} />.
            </p>
            <p className="mt-2 rounded-lg bg-indigo-500/5 px-3 py-2 text-center font-display text-base italic">
              E(X) = Σ x<sub>i</sub> · P(X = x<sub>i</sub>)
            </p>
          </div>
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted">{m.sources}</p>
            <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
              {[m.source1, m.source2].map((s, i) => (
                <span key={s} className="flex items-center gap-1.5 truncate text-[0.7rem]">
                  <Pill n={i + 1} />
                  <span className="truncate">{s}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface p-1 pl-3 shadow-card">
            <span className="text-muted">+</span>
            <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted opacity-70">{m.ask}</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground">
              {icon(<path d="M12 19V5M6 11l6-6 6 6" />, "h-3.5 w-3.5")}
            </span>
          </div>
        </div>
      </div>
      {/* Cartes flottantes */}
      <div aria-hidden className="absolute -bottom-5 -left-3 w-40 rounded-2xl border border-line bg-surface p-3 shadow-pop sm:-left-8">
        <p className="flex items-center justify-between text-[0.7rem] font-medium">
          {m.quiz}
          <span className="tabular-nums text-success">{m.quizScore}</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-4/5 rounded-full bg-success" />
        </div>
      </div>
      <div
        aria-hidden
        className="absolute -right-2 -top-4 flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[0.7rem] font-medium shadow-pop sm:-right-5"
      >
        <span className="text-amber-500">{icon(<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5.5 1 1 1.5 2 1.5 3.5C12 8.5 12 6 12 3Z" />, "h-3.5 w-3.5")}</span>
        {m.streak}
      </div>
    </div>
  );
}

/** Aperçu du mode professeur : la barre d'un cours vide, la rédaction en cours et les sources. */
function TeacherPreview() {
  const { t } = useT();
  const m = t.landing.teacherMock;
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-accent-soft blur-3xl" />
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-[1.4rem] border border-accent/40 bg-surface p-1.5 pl-4 shadow-pop ring-4 ring-accent-soft">
          <span className="text-muted">+</span>
          <span className="min-w-0 flex-1 truncate text-sm">{m.topic}</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.7rem] font-medium text-accent-text">{m.level}</span>
          <span className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-medium text-accent-foreground">
            {sparkleIcon}
          </span>
        </div>
        <div className="rounded-[1.4rem] border border-line bg-surface p-5 shadow-card">
          <p className="flex items-center gap-2.5 text-sm font-medium">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
            </span>
            {m.generating}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-[64%] rounded-full bg-accent" />
          </div>
          <ul className="mt-4 space-y-2 text-xs">
            {m.steps.map((step, i) => (
              <li key={step} className={`flex items-center gap-2 ${i < 2 ? "" : "text-muted"}`}>
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full ${
                    i < 2 ? "bg-success/15 text-success" : "border border-line-strong"
                  }`}
                >
                  {i < 2 && icon(<path d="m5 12.5 4.5 4.5L19 7.5" />, "h-3 w-3")}
                </span>
                {step}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[1.4rem] border border-line bg-surface p-4 shadow-card">
          <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted">{m.sources}</p>
          <ul className="mt-2 space-y-1.5">
            {[
              { title: `${m.topic} — Wikipedia`, domain: "wikipedia.org" },
              { title: m.topic, domain: "wikiversity.org" },
            ].map((s, i) => (
              <li key={s.domain} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-md border border-accent/30 bg-accent-soft text-[0.65rem] font-semibold text-accent-text">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{s.title}</span>
                  <span className="block text-[0.65rem] text-muted">{s.domain} ↗</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ id, eyebrow, title, intro }: { id: string; eyebrow: string; title: string; intro?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="mt-4 leading-relaxed text-muted">{intro}</p>}
    </Reveal>
  );
}

/**
 * Page publique de Clarity (/login et /signup) : présentation qui défile (accroche, fonctionnement,
 * fonctionnalités, mode professeur, projet personnel), puis la carte Connexion / Inscription tout en bas.
 * Lit ?next= : doit être rendue sous <Suspense>.
 */
export function AuthLanding({ initialTab }: { initialTab: AuthTab }) {
  const { t } = useT();
  const l = t.landing;
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const cardRef = useRef<HTMLDivElement>(null);

  /** Ouvre un onglet de la carte du bas, y fait défiler la page et (au clic) place le curseur dans l'email */
  const openAuth = useCallback((next: AuthTab, { focus = true, smooth = true } = {}) => {
    setTab(next);
    history.replaceState(null, "", `${location.pathname}${location.search}#${HASH[next]}`);
    requestAnimationFrame(() => {
      const card = cardRef.current;
      if (!card) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ behavior: smooth && !reduce ? "smooth" : "auto", block: "center" });
      if (focus) card.querySelector<HTMLInputElement>(`#panel-${next} input[type="email"]`)?.focus({ preventScroll: true });
    });
  }, []);

  // Lien direct (#inscription, #connexion), page /signup, ou retour d'une page protégée (?next=) : formulaire tout de suite
  useEffect(() => {
    const fromHash = (Object.keys(HASH) as AuthTab[]).find((k) => location.hash === `#${HASH[k]}`);
    const first = fromHash ?? (initialTab === "signup" || searchParams.has("next") ? initialTab : null);
    // Après le premier affichage (la page doit être en place pour défiler jusqu'à la carte)
    const frame = first ? requestAnimationFrame(() => openAuth(first, { focus: false, smooth: false })) : 0;
    const onHash = () => {
      const k = (Object.keys(HASH) as AuthTab[]).find((key) => location.hash === `#${HASH[key]}`);
      if (k) openAuth(k, { focus: false });
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", onHash);
    };
  }, [initialTab, searchParams, openAuth]);

  const authLink = (next: AuthTab) => ({
    href: `#${HASH[next]}`,
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      openAuth(next);
    },
  });

  return (
    <div id="haut" className="relative isolate flex flex-1 flex-col overflow-x-clip">
      {/* Barre de navigation légère, collée en haut */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-background/75 backdrop-blur-md">
        <nav aria-label={l.nav.label} className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
          <a href="#haut" className="mr-auto rounded-lg">
            <Logo href={null} />
          </a>
          <div className="hidden items-center gap-1 text-sm text-muted md:flex">
            {[
              ["#fonctionnalites", l.nav.features],
              ["#professeur", l.nav.teacher],
              ["#projet", l.nav.project],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-lg px-3 py-1.5 transition hover:bg-surface-2 hover:text-foreground">
                {label}
              </a>
            ))}
          </div>
          <LanguageSwitcher compact />
          <ThemeToggle />
          <a {...authLink("login")} className="btn btn-secondary ml-1 hidden px-3 py-1.5 shadow-card sm:inline-flex">
            {l.nav.login}
          </a>
        </nav>
      </header>

      <main className="flex-1">
        {/* Accroche */}
        <section className="relative">
          <GridBackground className="bottom-auto h-[40rem] [mask-image:linear-gradient(to_bottom,black_35%,transparent)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-12 lg:pb-28 lg:pt-24">
            <div className="text-center lg:text-left">
              <p className="eyebrow rise-in">{l.eyebrow}</p>
              <BlurText
                key={l.title}
                as="h1"
                text={l.title}
                trigger="load"
                delay={60}
                distance={14}
                className="mt-4 justify-center text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:justify-start lg:text-6xl"
              />
              <p className="rise-in mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted [animation-delay:200ms] lg:mx-0">
                {l.intro}
              </p>
              <div className="rise-in mt-8 flex flex-col items-center gap-3 [animation-delay:300ms] sm:flex-row sm:justify-center lg:justify-start">
                <a {...authLink("signup")} className="btn btn-primary w-full px-6 py-3 text-base shadow-pop sm:w-auto">
                  {l.ctaStart}
                  <span aria-hidden>→</span>
                </a>
                <a {...authLink("login")} className="btn btn-secondary w-full px-6 py-3 text-base shadow-card sm:w-auto">
                  {l.ctaLogin}
                </a>
              </div>
              <p className="rise-in mt-5 text-xs text-muted [animation-delay:400ms]">{l.heroNote}</p>
            </div>
            <div className="rise-in px-4 [animation-delay:250ms] sm:px-8 lg:px-0">
              <AppPreview />
            </div>
          </div>
        </section>

        {/* Comment ça marche */}
        <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <SectionHeading id="how-title" eyebrow={l.howEyebrow} title={l.howTitle} />
          <ol className="mt-12 grid gap-4 sm:grid-cols-3">
            {l.steps.map((step, i) => (
              <Reveal as="li" key={i} delay={i * 90}>
                <Spotlight className="h-full p-6">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground font-display text-base italic text-background">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
                </Spotlight>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Fonctionnalités */}
        <section
          id="fonctionnalites"
          aria-labelledby="features-title"
          className="scroll-mt-16 border-y border-line bg-surface-2/40 py-20 lg:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading id="features-title" eyebrow={l.featuresEyebrow} title={l.featuresTitle} intro={l.featuresIntro} />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {l.features.map((feature, i) => (
                <Reveal as="li" key={i} delay={(i % 3) * 70}>
                  <Spotlight className="h-full p-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-accent-text shadow-card">
                      {FEATURE_ICONS[i]}
                    </span>
                    <h3 className="mt-4 font-semibold">{feature.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{feature.text}</p>
                  </Spotlight>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* Mode professeur */}
        <section id="professeur" aria-labelledby="teacher-title" className="scroll-mt-16">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-28">
            <Reveal className="text-center lg:text-left">
              <p className="eyebrow flex items-center justify-center gap-1.5 lg:justify-start">
                {sparkleIcon}
                {l.teacherEyebrow}
              </p>
              <h2 id="teacher-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {l.teacherTitle}
              </h2>
              <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted lg:mx-0">{l.teacherText}</p>
              <ul className="mx-auto mt-8 max-w-xl space-y-3 text-left lg:mx-0">
                {l.teacherPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm leading-relaxed">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                      {checkIcon}
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={120} className="px-2 sm:px-6 lg:px-0">
              <TeacherPreview />
            </Reveal>
          </div>
        </section>

        {/* Projet personnel */}
        <section id="projet" aria-labelledby="project-title" className="scroll-mt-16 px-4 pb-20 sm:px-6 lg:pb-28">
          <Reveal className="mx-auto max-w-3xl">
            <Spotlight className="px-6 py-10 text-center sm:px-12">
              <span
                aria-hidden
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-foreground font-display text-xl italic text-background"
              >
                AH
              </span>
              <p className="eyebrow mt-5">{l.projectEyebrow}</p>
              <h2 id="project-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {l.projectTitle}
              </h2>
              <p className="mx-auto mt-3 max-w-lg leading-relaxed text-muted">{l.projectText}</p>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn btn-secondary mt-6 shadow-card">
                <GitHubIcon />
                {l.github}
                <span aria-hidden className="text-muted">
                  ↗
                </span>
              </a>
            </Spotlight>
          </Reveal>
        </section>

        {/* Connexion / Inscription */}
        <section
          id={HASH.login}
          aria-labelledby="auth-title"
          className="relative scroll-mt-16 border-t border-line px-4 pb-20 pt-20 sm:px-6 lg:pb-28"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-24 -z-10 h-72 w-[min(40rem,90vw)] -translate-x-1/2 rounded-full bg-accent-soft blur-3xl"
          />
          <SectionHeading id="auth-title" eyebrow={l.authEyebrow} title={l.authTitle} intro={l.authText} />
          <div id={HASH.signup} ref={cardRef} className="mx-auto mt-10 w-full max-w-md scroll-mt-24">
            <div className="card p-6 sm:p-8">
              <div role="tablist" aria-label={l.tabsLabel} className="mb-7 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
                {(["login", "signup"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    id={`tab-${key}`}
                    aria-selected={tab === key}
                    aria-controls={`panel-${key}`}
                    tabIndex={tab === key ? 0 : -1}
                    onClick={() => openAuth(key, { focus: false, smooth: false })}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                        const other = key === "login" ? "signup" : "login";
                        openAuth(other, { focus: false, smooth: false });
                        document.getElementById(`tab-${other}`)?.focus();
                      }
                    }}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      tab === key ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {key === "login" ? l.tabLogin : l.tabSignup}
                  </button>
                ))}
              </div>
              {/* Les deux panneaux restent montés : changer d'onglet ne perd pas une saisie ou un code en cours */}
              <div id="panel-login" role="tabpanel" aria-labelledby="tab-login" hidden={tab !== "login"}>
                <LoginPanel onSwitchToSignup={() => openAuth("signup")} />
              </div>
              <div id="panel-signup" role="tabpanel" aria-labelledby="tab-signup" hidden={tab !== "signup"}>
                <SignupPanel onSwitchToLogin={() => openAuth("login")} />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
