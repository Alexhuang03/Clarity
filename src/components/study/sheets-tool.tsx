"use client";

import { useState } from "react";
import { Markdown } from "@/components/course/markdown";
import type { SheetResponse, SheetSummary, StudyScope } from "@/lib/study/types";
import { errorMessage, formatDate, studyApi } from "./api";
import { DeleteButton, ErrorNote, Field, Generating, ListSkeleton, ScopePicker, SectionTitle, ToolIntro, type ScopeOptions } from "./ui";
import { useStudyResource } from "./use-study";
import { useT } from "@/lib/i18n/client";

export function SheetsTool({ courseId, scopeOptions }: { courseId: string; scopeOptions: ScopeOptions }) {
  const list = useStudyResource<{ sheets: SheetSummary[] }>(courseId, "/sheets");
  const { t, intl } = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState<"new" | "regen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<StudyScope>({});
  const [title, setTitle] = useState("");

  const sheets = list.data?.sheets ?? [];
  const currentId = selected ?? (creating ? null : (sheets[0]?.id ?? null));
  const sheet = useStudyResource<SheetResponse>(courseId, currentId && !generating ? `/sheets/${currentId}` : null);
  const shown = sheet.data && sheet.data.sheet.id === currentId ? sheet.data.sheet : null;

  async function generate() {
    setError(null);
    setGenerating("new");
    try {
      const res = await studyApi<SheetResponse>(courseId, "/sheets", {
        method: "POST",
        body: { scope, title: title.trim() || undefined },
      });
      list.setData((d) => ({ sheets: [res.sheet, ...(d?.sheets ?? [])] }));
      setSelected(res.sheet.id);
      setCreating(false);
      setTitle("");
    } catch (e) {
      setError(errorMessage(e));
    }
    setGenerating(null);
  }

  async function regenerate(id: string) {
    setError(null);
    setGenerating("regen");
    try {
      const res = await studyApi<SheetResponse>(courseId, `/sheets/${id}/regenerate`, { method: "POST" });
      sheet.setData(() => res);
      list.setData((d) => (d ? { sheets: d.sheets.map((s) => (s.id === id ? res.sheet : s)) } : d));
    } catch (e) {
      setError(errorMessage(e));
    }
    setGenerating(null);
  }

  async function remove(id: string) {
    try {
      await studyApi(courseId, `/sheets/${id}`, { method: "DELETE" });
      list.setData((d) => (d ? { sheets: d.sheets.filter((s) => s.id !== id) } : d));
      setSelected(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const showForm = creating || (list.data && sheets.length === 0);

  return (
    <>
      <ToolIntro
        title={t.study.sheets.title}
        action={
          !showForm && (
            <button type="button" onClick={() => setCreating(true)} disabled={!!generating} className="btn btn-primary">
              {t.study.sheets.new}
            </button>
          )
        }
      >
        {t.study.sheets.intro}
      </ToolIntro>

      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="print:hidden">
          <SectionTitle>{t.study.sheets.mine}</SectionTitle>
          {list.loading && !list.data ? (
            <ListSkeleton />
          ) : list.error ? (
            <ErrorNote message={list.error} onRetry={list.reload} />
          ) : sheets.length === 0 ? (
            <p className="text-sm text-muted">{t.study.sheets.none}</p>
          ) : (
            <ul className="space-y-1">
              {sheets.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(s.id);
                      setCreating(false);
                    }}
                    aria-current={s.id === currentId ? "true" : undefined}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      s.id === currentId && !showForm ? "bg-surface font-medium shadow-card" : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <span className="line-clamp-2">{s.title}</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted">{formatDate(s.updatedAt, intl)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          <ErrorNote message={error} />
          {generating ? (
            <Generating
              label={generating === "regen" ? t.study.sheets.regenerating : t.study.generating}
              hint={t.study.sheets.generatingHint}
            />
          ) : showForm ? (
            <div className="card rise-in">
              <div className="space-y-6 p-6">
                <Field label={t.study.titleLabel} hint={t.study.optional}>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t.study.sheets.titlePlaceholder} className="field" />
                </Field>
                <ScopePicker options={scopeOptions} value={scope} onChange={setScope} />
              </div>
              <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
                {sheets.length > 0 && (
                  <button type="button" onClick={() => setCreating(false)} className="btn btn-ghost">
                    {t.common.cancel}
                  </button>
                )}
                <button type="button" onClick={generate} className="btn btn-primary">
                  {t.study.sheets.generate}
                </button>
              </div>
            </div>
          ) : shown ? (
            <article className="rise-in">
              <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
                <p className="mr-auto text-xs text-muted">{t.study.sheets.updatedOn(formatDate(shown.updatedAt, intl))}</p>
                <button type="button" onClick={() => window.print()} className="btn btn-ghost px-3 py-1.5">
                  {t.study.sheets.print}
                </button>
                <button type="button" onClick={() => regenerate(shown.id)} className="btn btn-secondary px-3 py-1.5">
                  {t.study.sheets.regenerate}
                </button>
                <DeleteButton onDelete={() => remove(shown.id)} label={t.study.sheets.delete} />
              </div>
              <Markdown content={shown.content} sources={shown.data.sources} variant="summary" messageId={`sheet-${shown.id}`} />
            </article>
          ) : sheet.error ? (
            <ErrorNote message={sheet.error} onRetry={sheet.reload} />
          ) : (
            <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
          )}
        </div>
      </div>
    </>
  );
}
