"use client";

import { useMemo, useState } from "react";
import type { MindMapNode, MindMapResponse, MindMapSummary, StudyScope } from "@/lib/study/types";
import { errorMessage, formatDate, studyApi } from "./api";
import { DeleteButton, ErrorNote, Field, Generating, ListSkeleton, Md, ScopePicker, SectionTitle, ToolIntro, type ScopeOptions } from "./ui";
import { useStudyResource } from "./use-study";

// ------------------------------------------------------------------ Disposition de l'arbre

const NODE_W = 196;
const NODE_H = 52;
const GAP_X = 56;
const ROW_H = 64;
/** Une couleur par grande branche (lisible sur fond clair comme sombre) */
const BRANCH_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444", "#84cc16", "#f97316"];

type Placed = { node: MindMapNode; depth: number; x: number; y: number; color: string; parent: Placed | null; hidden: number };

/** Arbre de gauche à droite : chaque feuille visible occupe une ligne, un parent est centré sur ses enfants. */
function layout(root: MindMapNode, collapsed: Set<string>) {
  const placed: Placed[] = [];
  let row = 0;
  const count = (n: MindMapNode): number => n.children.reduce((s, c) => s + 1 + count(c), 0);
  const place = (node: MindMapNode, depth: number, color: string, parent: Placed | null): Placed => {
    const self: Placed = { node, depth, x: depth * (NODE_W + GAP_X), y: 0, color, parent, hidden: 0 };
    placed.push(self);
    if (node.children.length === 0 || collapsed.has(node.id)) {
      self.y = row++ * ROW_H;
      self.hidden = collapsed.has(node.id) ? count(node) : 0;
    } else {
      const kids = node.children.map((c, i) => place(c, depth + 1, depth === 0 ? BRANCH_COLORS[i % BRANCH_COLORS.length] : color, self));
      self.y = (kids[0].y + kids[kids.length - 1].y) / 2;
    }
    return self;
  };
  place(root, 0, "var(--accent)", null);
  const depth = Math.max(...placed.map((p) => p.depth));
  return { placed, width: (depth + 1) * (NODE_W + GAP_X) - GAP_X, height: Math.max(1, row) * ROW_H - (ROW_H - NODE_H) };
}

/** Nœuds repliés au départ : tout ce qui est sous le 2ᵉ niveau. */
function initialCollapsed(root: MindMapNode) {
  const set = new Set<string>();
  const walk = (n: MindMapNode, depth: number) => {
    if (depth >= 2 && n.children.length) set.add(n.id);
    n.children.forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);
  return set;
}

function MindMapView({ tree }: { tree: MindMapNode }) {
  const [collapsed, setCollapsed] = useState(() => initialCollapsed(tree));
  const [selected, setSelected] = useState<MindMapNode | null>(null);
  const { placed, width, height } = useMemo(() => layout(tree, collapsed), [tree, collapsed]);

  const toggle = (id: string) =>
    setCollapsed((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const collapseAll = () => {
    const set = new Set<string>();
    tree.children.forEach((c) => c.children.length && set.add(c.id));
    setCollapsed(set);
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-sm">
        <span className="mr-auto text-xs text-muted">Clique sur une notion pour la déplier et voir son résumé.</span>
        <button type="button" onClick={() => setCollapsed(new Set())} className="btn btn-ghost px-2.5 py-1 text-xs">
          Tout déplier
        </button>
        <button type="button" onClick={collapseAll} className="btn btn-ghost px-2.5 py-1 text-xs">
          Tout replier
        </button>
      </div>
      <div className="overflow-auto bg-[radial-gradient(var(--line)_1px,transparent_1px)] [background-size:20px_20px] p-6">
        <div className="relative" style={{ width, height }}>
          <svg aria-hidden className="absolute inset-0 overflow-visible" width={width} height={height}>
            {placed.map((p) =>
              p.parent ? (
                <path
                  key={p.node.id}
                  d={`M ${p.parent.x + NODE_W} ${p.parent.y + NODE_H / 2} C ${p.parent.x + NODE_W + GAP_X / 2} ${p.parent.y + NODE_H / 2}, ${p.x - GAP_X / 2} ${p.y + NODE_H / 2}, ${p.x} ${p.y + NODE_H / 2}`}
                  fill="none"
                  stroke={p.color}
                  strokeOpacity={0.45}
                  strokeWidth={p.depth === 1 ? 2 : 1.5}
                />
              ) : null,
            )}
          </svg>
          <ul role="tree" aria-label="Carte mentale">
            {placed.map((p) => {
              const hasChildren = p.node.children.length > 0;
              const isCollapsed = collapsed.has(p.node.id);
              const isSelected = selected?.id === p.node.id;
              return (
                <li
                  key={p.node.id}
                  role="treeitem"
                  aria-level={p.depth + 1}
                  aria-expanded={hasChildren ? !isCollapsed : undefined}
                  aria-selected={isSelected}
                  className="absolute transition-[left,top] duration-300 ease-[var(--ease-out-soft)] motion-reduce:transition-none"
                  style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(p.node);
                      if (hasChildren) toggle(p.node.id);
                    }}
                    title={p.node.label}
                    className={`flex h-full w-full items-center gap-2 rounded-xl border px-3 text-left text-sm leading-tight shadow-card transition hover:-translate-y-px ${
                      p.depth === 0
                        ? "border-transparent bg-foreground font-semibold text-background"
                        : `bg-surface ${isSelected ? "border-line-strong" : "border-line"} ${p.depth === 1 ? "font-medium" : ""}`
                    }`}
                    style={p.depth > 0 ? { borderLeft: `3px solid ${p.color}` } : undefined}
                  >
                    <span className="line-clamp-2 min-w-0 flex-1">{p.node.label}</span>
                    {hasChildren && (
                      <span
                        aria-hidden
                        className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[0.65rem] tabular-nums ${
                          p.depth === 0 ? "bg-background/20" : "bg-surface-2 text-muted"
                        }`}
                      >
                        {isCollapsed ? `+${p.hidden}` : "−"}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {selected && (
        <div className="rise-in border-t border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{selected.label}</p>
              {selected.summary ? (
                <Md text={selected.summary} className="mt-1 text-muted" />
              ) : (
                <p className="mt-1 text-sm text-muted">Pas de résumé pour cette notion.</p>
              )}
            </div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Fermer" className="btn btn-ghost px-2 py-1">
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Outil

export function MindMapTool({ courseId, scopeOptions }: { courseId: string; scopeOptions: ScopeOptions }) {
  const list = useStudyResource<{ mindmaps: MindMapSummary[] }>(courseId, "/mindmaps");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<StudyScope>({});
  const [title, setTitle] = useState("");

  const maps = list.data?.mindmaps ?? [];
  const currentId = selected ?? (creating ? null : (maps[0]?.id ?? null));
  const map = useStudyResource<MindMapResponse>(courseId, currentId && !generating ? `/mindmaps/${currentId}` : null);
  const shown = map.data && map.data.mindmap.id === currentId ? map.data.mindmap : null;
  const showForm = creating || (list.data && maps.length === 0);

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await studyApi<MindMapResponse>(courseId, "/mindmaps", { method: "POST", body: { scope, title: title.trim() || undefined } });
      list.setData((d) => ({ mindmaps: [res.mindmap, ...(d?.mindmaps ?? [])] }));
      map.setData(() => res);
      setSelected(res.mindmap.id);
      setCreating(false);
      setTitle("");
    } catch (e) {
      setError(errorMessage(e));
    }
    setGenerating(false);
  }

  async function remove(id: string) {
    try {
      await studyApi(courseId, `/mindmaps/${id}`, { method: "DELETE" });
      list.setData((d) => (d ? { mindmaps: d.mindmaps.filter((m) => m.id !== id) } : d));
      setSelected(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <ToolIntro
        title="Carte mentale"
        action={
          !showForm && (
            <button type="button" onClick={() => setCreating(true)} disabled={generating} className="btn btn-primary">
              Nouvelle carte
            </button>
          )
        }
      >
        Les grandes notions du cours et la façon dont elles s&apos;articulent.
      </ToolIntro>

      {maps.length > 1 && !showForm && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {maps.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m.id)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                m.id === currentId ? "border-accent/50 bg-accent-soft text-accent-text" : "border-line text-muted hover:text-foreground"
              }`}
            >
              {m.title}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        <ErrorNote message={error} />
        {list.loading && !list.data ? (
          <ListSkeleton />
        ) : list.error ? (
          <ErrorNote message={list.error} onRetry={list.reload} />
        ) : generating ? (
          <Generating hint="Clarity repère les grandes notions du cours et leurs liens : comptes 20 à 60 secondes." />
        ) : showForm ? (
          <div className="card rise-in">
            <div className="space-y-6 p-6">
              <Field label="Titre" hint="facultatif">
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex. Vue d'ensemble du chapitre 1" className="field" />
              </Field>
              <ScopePicker options={scopeOptions} value={scope} onChange={setScope} />
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
              {maps.length > 0 && (
                <button type="button" onClick={() => setCreating(false)} className="btn btn-ghost">
                  Annuler
                </button>
              )}
              <button type="button" onClick={generate} className="btn btn-primary">
                Générer la carte
              </button>
            </div>
          </div>
        ) : shown ? (
          <section className="rise-in">
            <div className="mb-3 flex items-center gap-2">
              <div className="mr-auto min-w-0">
                <SectionTitle>{shown.title}</SectionTitle>
              </div>
              <span className="text-xs text-muted">{formatDate(shown.createdAt)}</span>
              <DeleteButton onDelete={() => remove(shown.id)} label="Supprimer la carte" />
            </div>
            <MindMapView key={shown.id} tree={shown.tree} />
          </section>
        ) : map.error ? (
          <ErrorNote message={map.error} onRetry={map.reload} />
        ) : (
          <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
        )}
      </div>
    </>
  );
}
