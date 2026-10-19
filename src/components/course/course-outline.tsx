"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { MessageRow } from "@/lib/course/types";
import { summaryHeadings } from "./markdown";

// Le sommaire reste sobre : pas d'emoji devant les titres
const stripEmoji = (text: string) => text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").trim();

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Sommaire du cours, fixé dans la colonne de gauche sur grand écran.
 * Les parties sont numérotées ; seules les sections de la partie en cours de lecture sont dépliées.
 */
export const CourseOutline = memo(function CourseOutline({
  messages,
  partTitle,
}: {
  messages: MessageRow[];
  partTitle: (id: string | null) => string | undefined;
}) {
  const groups = useMemo(
    () =>
      messages
        .filter((m) => m.role === "assistant" && m.kind === "summary")
        .map((m) => ({
          id: m.id,
          title: partTitle(m.part_id) ?? "Résumé",
          // Les grandes sections (##) seulement : les sous-titres encombrent le sommaire
          sections: summaryHeadings(m.id, m.content)
            .filter((h) => h.level === 2)
            .map((h) => ({ id: h.id, text: stripEmoji(h.text) })),
        }))
        .filter((g) => g.sections.length > 0),
    [messages, partTitle],
  );
  const active = useActiveHeading(groups.flatMap((g) => g.sections.map((s) => s.id)));
  const activeGroup = groups.find((g) => g.sections.some((s) => s.id === active))?.id ?? groups[0]?.id;

  // La section active reste visible quand le sommaire est plus haut que l'écran
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="location"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (groups.length === 0) return null;
  const single = groups.length === 1;

  return (
    <nav ref={navRef} aria-label="Sommaire du cours" className="text-[0.8125rem] leading-snug">
      <p className="mb-4 text-[0.6875rem] font-medium uppercase tracking-[0.12em] opacity-40">Sommaire</p>
      <ol className="space-y-1">
        {groups.map((group, i) => {
          const open = single || group.id === activeGroup;
          return (
            <li key={group.id}>
              {!single && (
                <button
                  type="button"
                  onClick={() => scrollTo(group.sections[0].id)}
                  className={`flex w-full gap-3 rounded-md py-1.5 text-left transition ${
                    open ? "font-medium" : "opacity-50 hover:opacity-90"
                  }`}
                >
                  <span className="w-5 shrink-0 tabular-nums opacity-50">{String(i + 1).padStart(2, "0")}</span>
                  <span className="line-clamp-2">{group.title}</span>
                </button>
              )}
              {open && (
                <ul className={`space-y-px pb-2 ${single ? "" : "ml-8"}`}>
                  {group.sections.map((section) => {
                    const current = section.id === active;
                    return (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            scrollTo(section.id);
                          }}
                          aria-current={current ? "location" : undefined}
                          className={`relative block py-1 pl-3 transition before:absolute before:left-0 before:top-1/2 before:h-1 before:w-1 before:-translate-y-1/2 before:rounded-full before:transition ${
                            current
                              ? "text-indigo-600 before:bg-indigo-500 dark:text-indigo-300"
                              : "opacity-50 before:bg-transparent hover:opacity-90"
                          }`}
                        >
                          <span className="line-clamp-2">{section.text}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});

/** Dernier titre passé sous le haut de l'écran. */
function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) return;
    function update() {
      let current: string | null = null;
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 120) current = id;
      }
      setActive(current ?? list[0]);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [key]);

  return active;
}
