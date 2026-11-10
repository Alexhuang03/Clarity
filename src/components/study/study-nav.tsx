"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { motion } from "motion/react";
import { STUDY_TOOLS } from "./tools";

/**
 * Onglets de l'espace « Réviser » d'un cours. La pastille de l'onglet actif glisse d'un onglet
 * à l'autre (layoutId de motion ; instantané si prefers-reduced-motion). Défilement horizontal sur mobile.
 * Lit l'URL : à placer sous <Suspense> (Cache Components).
 */
export function StudyNav() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `/courses/${id}/study`;
  const tabs = [{ href: base, label: "Vue d'ensemble" }, ...STUDY_TOOLS.map((t) => ({ href: `${base}/${t.slug}`, label: t.label }))];

  return (
    <nav
      aria-label="Outils de révision"
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max gap-1 pb-3">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative isolate block rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  active ? "text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="study-tab"
                    transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                    className="absolute inset-0 -z-10 rounded-full border border-line bg-surface shadow-card"
                  />
                )}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function StudyNavSkeleton() {
  return (
    <div className="flex gap-2 pb-3" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-surface-2" />
      ))}
    </div>
  );
}
