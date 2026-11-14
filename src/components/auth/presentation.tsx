"use client";

import BlurText from "@/components/reactbits/BlurText";
import { Spotlight } from "@/components/ui/spotlight";
import { useT } from "@/lib/i18n/client";

const GITHUB_URL = "https://github.com/Alexhuang03";

const icon = (d: React.ReactNode) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-[18px] w-[18px]"
  >
    {d}
  </svg>
);

// Même ordre que t.landing.features
const FEATURE_ICONS = [
  icon(<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h4" />),
  // Mode professeur : chapeau de diplômé
  icon(<path d="M2 9.5 12 5l10 4.5-10 4.5L2 9.5ZM6 11.3V16c0 1.2 2.7 3 6 3s6-1.8 6-3v-4.7M22 9.5V15" />),
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
];

export function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Présentation de Clarity à côté du formulaire de connexion : l'idée, le fonctionnement, les outils. */
export function LoginPresentation() {
  const { t } = useT();
  const l = t.landing;
  return (
    <section className="mx-auto max-w-2xl lg:mx-0">
      <p className="eyebrow">{l.eyebrow}</p>
      <BlurText
        key={l.title}
        as="h2"
        text={l.title}
        trigger="load"
        delay={60}
        distance={14}
        className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
      />
      <p className="mt-4 max-w-xl leading-relaxed text-muted">{l.intro}</p>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-secondary mt-6 shadow-card"
      >
        <GitHubIcon />
        {l.github}
        <span aria-hidden className="text-muted">
          ↗
        </span>
      </a>

      <h3 className="mt-14 text-xs font-semibold uppercase tracking-wider text-muted">{l.howTitle}</h3>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {l.steps.map((step, i) => (
          <li key={i} className="rise-in" style={{ animationDelay: `${150 + i * 90}ms` }}>
            <Spotlight className="h-full p-5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground font-display text-sm italic text-background">
                {i + 1}
              </span>
              <p className="mt-4 font-medium">{step.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.text}</p>
            </Spotlight>
          </li>
        ))}
      </ol>

      <h3 className="mt-14 text-xs font-semibold uppercase tracking-wider text-muted">{l.featuresTitle}</h3>
      <ul className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {l.features.map((feature, i) => (
          <li key={i} className="rise-in flex gap-3.5" style={{ animationDelay: `${400 + i * 50}ms` }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-accent-text shadow-card">
              {FEATURE_ICONS[i]}
            </span>
            <span>
              <span className="block text-sm font-medium">{feature.title}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-muted">{feature.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
