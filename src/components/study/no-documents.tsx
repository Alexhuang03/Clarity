"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { StudyEmptyState } from "./empty-state";
import type { StudyToolSlug } from "./tools";

/** Aucun document prêt dans le cours : les outils de révision n'ont rien à lire. */
export function NoDocuments({ slug, courseId }: { slug: StudyToolSlug; courseId: string }) {
  const { t } = useT();
  return (
    <StudyEmptyState
      slug={slug}
      message={t.study.noDocuments}
      action={
        <Link href={`/courses/${courseId}`} transitionTypes={["nav-back"]} className="btn btn-primary">
          {t.study.addDocuments}
        </Link>
      }
    />
  );
}
