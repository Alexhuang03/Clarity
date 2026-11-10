import Link from "next/link";
import { StudyEmptyState } from "./empty-state";
import type { StudyToolSlug } from "./tools";

/** Aucun document prêt dans le cours : les outils de révision n'ont rien à lire. */
export function NoDocuments({ slug, courseId }: { slug: StudyToolSlug; courseId: string }) {
  return (
    <StudyEmptyState
      slug={slug}
      message="Ajoute d'abord tes documents de cours (PDF, Word, photos…) et attends qu'ils soient lus : Clarity s'en servira pour préparer tes révisions."
      action={
        <Link href={`/courses/${courseId}`} transitionTypes={["nav-back"]} className="btn btn-primary">
          Ajouter des documents
        </Link>
      }
    />
  );
}
