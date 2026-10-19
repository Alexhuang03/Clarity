"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { MessageRow, PartRow } from "@/lib/course/types";
import { summaryHeadings } from "./markdown";

// Le sommaire reste sobre : pas d'emoji devant les titres
const stripEmoji = (text: string) => text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").trim();

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Sommaire du cours : dans la marge de gauche sur très grand écran, dans un panneau sinon.
 * Les parties sont numérotées ; seules les sections de la partie en cours de lecture sont dépliées.
 */
export const CourseOutline = memo(function CourseOutline({
  messages,
  parts,
  onNavigate,
}: {
  messages: MessageRow[];
  parts: PartRow[];
  /** Appelé avant de défiler vers un titre (ex. fermer le panneau sur mobile) */
  onNavigate?: () => void;
}) {
  function go(id: string) {
    onNavigate?.();
    // Une image plus tard : le panneau est fermé et la page peut défiler
    requestAnimationFrame(() => scrollTo(id));
  }

  const groups = useMemo(
    () =>
      messages
        .filter((m) => m.role === "assistant" && m.kind === "summary")
        .map((m) => ({
          id: m.id,
          title: parts.find((p) => p.id === m.part_id)?.title ?? "Résumé",
          // Les grandes sections (##) seulement : les sous-titres encombrent le sommaire
          sections: summaryHeadings(m.id, m.content)
            .filter((h) => h.level === 2)
            .map((h) => ({ id: h.id, text: stripEmoji(h.text) })),
        }))
        .filter((g) => g.sections.length > 0),
    [messages, parts],
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
                  onClick={() => go(group.sections[0].id)}
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
                            go(section.id);
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

/** True s'il y a au moins un résumé avec des titres (sinon le sommaire est vide). */
export function hasOutline(messages: MessageRow[]) {
  return messages.some((m) => m.role === "assistant" && m.kind === "summary" && /^## /m.test(m.content));
}

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
