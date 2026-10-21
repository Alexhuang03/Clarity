"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { anchorFromRange, buildTextIndex, rangeFromAnchor, type Anchor } from "@/lib/annotations/anchor";
import { HIGHLIGHT_COLORS, HIGHLIGHT_SWATCH, type AnnotationRow, type HighlightColor } from "@/lib/annotations/types";
import {
  DEFAULT_EMOTE_WHEEL,
  emoteAnimUrl,
  emoteLabel,
  emoteSoundUrl,
  emoteStillUrl,
  PINGS,
  pingIconUrl,
  pingSoundUrl,
  TICK_SOUND,
  type PingAction,
} from "@/lib/annotations/lol";
import { playSound } from "@/lib/annotations/sound";
import { createAnnotation, deleteAnnotation, updateHighlightColor } from "@/app/courses/annotation-actions";
import { EmoteFx, hitTest, PING_LABELS, PING_ORDER, PingFx, pingItems, preloadEmote, Wheel, type WheelHit, type WheelItem } from "./wheel";

type Target = { messageId: string; anchor: Anchor; rect: DOMRect };
type WheelKind = "ping" | "emote";
/** right : clic droit maintenu · alt / ctrl : touche maintenue · click : roue ouverte, cliquable */
type Trigger = "right" | "alt" | "ctrl" | "click";
type WheelState = { kind: WheelKind; x: number; y: number; trigger: Trigger; target: Target };
type Composer = { kind: Exclude<PingAction, "highlight">; target: Target };
type MenuState = { annotation: AnnotationRow; x: number; y: number };
type EffectInput = { x: number; y: number } & ({ type: "ping"; action: PingAction } | { type: "emote"; slug: string });
type Effect = EffectInput & { id: number };

// Styles des marques (API CSS Custom Highlight). Injectés ici plutôt que dans globals.css :
// la compilation CSS de Tailwind supprime le sélecteur ::highlight(), encore récent.
const HIGHLIGHT_CSS = `
::highlight(hl-yellow) { background-color: rgb(250 204 21 / 0.38); }
::highlight(hl-green) { background-color: rgb(74 222 128 / 0.32); }
::highlight(hl-pink) { background-color: rgb(244 114 182 / 0.32); }
::highlight(hl-blue) { background-color: rgb(96 165 250 / 0.32); }
::highlight(ann-question) { text-decoration: underline dotted #f2c518 2px; }
::highlight(ann-understanding) { text-decoration: underline solid #2b80ff 2px; }
::highlight(ann-error) { text-decoration: underline wavy #ff3b55 1.5px; }
::highlight(ann-pending) { background-color: rgb(99 102 241 / 0.25); }
::highlight(ann-focus) { background-color: rgb(99 102 241 / 0.3); }
::highlight(ann-reaction) { text-decoration: underline dotted #c8aa6e 2px; }
`;

const DRAG_THRESHOLD = 36;
// Avec Alt ou Ctrl maintenu, la roue ne s'ouvre que si la souris bouge : Ctrl+C ou Alt+Tab ne l'ouvrent pas
const KEY_MOVE_THRESHOLD = 8;
const HIGHLIGHT_SLICE = PING_ORDER.indexOf("highlight");
const COLOR_KEY = "clarity-highlight-color";
const noSubscription = () => () => {};

const emoteItems: WheelItem[] = DEFAULT_EMOTE_WHEEL.map((slug) => ({
  key: slug,
  label: emoteLabel(slug),
  icon: emoteStillUrl(slug),
  color: "#c8aa6e",
  round: true,
}));

function readPref<T extends string>(key: string, fallback: T, allowed?: readonly T[]): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && (!allowed || allowed.includes(value)) ? value : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible (navigation privée) : la préférence n'est simplement pas retenue
  }
}

/** Texte situé sous un point de l'écran (caretRangeFromPoint pour les anciens Safari). */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const position = document.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/** Les fenêtres flottantes ne doivent pas déclencher les gestes de la page (sélection, clic sur une marque). */
const stopGestures = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
};

function targetFromRange(range: Range): Target | null {
  const container = range.commonAncestorContainer;
  const element = container instanceof Element ? container : container.parentElement;
  const root = element?.closest<HTMLElement>("[data-annotatable]");
  if (!root) return null;
  const anchor = anchorFromRange(root, range);
  if (!anchor) return null;
  const rects = range.getClientRects();
  return { messageId: root.dataset.annotatable!, anchor, rect: rects[rects.length - 1] ?? range.getBoundingClientRect() };
}

/** Sélection actuelle, si elle tient entièrement dans une réponse de l'IA annotable. */
function selectionTarget(): Target | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  return targetFromRange(selection.getRangeAt(0));
}

/** Mot situé sous le pointeur (raccourcis Alt / Ctrl sans sélection : on « pinge » un mot). */
function wordTarget(x: number, y: number): Target | null {
  const caret = caretAt(x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return null;
  const text = (caret.node as Text).data;
  const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}'’-]/u.test(c);
  let start = caret.offset;
  let end = caret.offset;
  while (start > 0 && isWord(text[start - 1])) start--;
  while (end < text.length && isWord(text[end])) end++;
  if (start === end) return null;
  const range = document.createRange();
  range.setStart(caret.node, start);
  range.setEnd(caret.node, end);
  return targetFromRange(range);
}

const COMPOSER_TEXT: Record<Composer["kind"], { placeholder: string; hint: string }> = {
  question: {
    placeholder: "Qu'est-ce que tu ne comprends pas ?",
    hint: "Ta question reste attachée au passage, souligné en pointillés.",
  },
  understanding: {
    placeholder: "Reformule ce passage avec tes propres mots…",
    hint: "Expliquer avec ses mots est la meilleure façon de vérifier qu'on a compris.",
  },
  error: {
    placeholder: "Qu'est-ce qui te semble faux ? (facultatif)",
    hint: "Le passage est marqué d'une vaguelette rouge, pour être revérifié.",
  },
};

const KIND_LABEL: Record<AnnotationRow["kind"], string> = {
  highlight: "Surlignage",
  question: "Question",
  understanding: "Ce que j'ai compris",
  error: "Erreur signalée",
  reaction: "Réaction",
};

/**
 * Couche d'annotation des réponses de l'IA, façon lolPing :
 * - roue de pings : clic droit maintenu sur une sélection, ou Alt maintenu + glisser
 * - roue d'émotes : Ctrl maintenu + glisser (ou bouton « Réactions » de la roue cliquable)
 * - sélection à la souris ou clic droit simple : roue cliquable
 * Avec Alt / Ctrl et sans sélection, l'action porte sur le mot sous le pointeur.
 * Les marques sont dessinées avec l'API CSS Custom Highlight (le texte n'est jamais modifié).
 * Maj + clic droit garde le menu habituel du navigateur.
 */
export function AnnotationLayer({
  initialAnnotations,
  version,
  children,
}: {
  initialAnnotations: AnnotationRow[];
  /** Change quand des messages apparaissent : les marques sont alors redessinées */
  version: number;
  children: React.ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const [wheel, setWheel] = useState<WheelState | null>(null);
  const [hit, setHit] = useState<WheelHit | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [error, setError] = useState<string | null>(null);
  // La roue n'est jamais affichée au premier rendu : lire la préférence ici ne crée pas d'écart serveur/navigateur
  const [lastColor, setLastColor] = useState<HighlightColor>(() =>
    typeof window === "undefined" ? "yellow" : readPref(COLOR_KEY, "yellow", HIGHLIGHT_COLORS),
  );
  const ranges = useRef(new Map<string, Range>());
  const stickers = useRef(new Map<string, HTMLButtonElement>());
  const suppressContextMenu = useRef(false);
  const lastPointerType = useRef("mouse");
  const pointer = useRef({ x: 0, y: 0 });
  const armed = useRef<{ kind: WheelKind; trigger: "alt" | "ctrl"; x: number; y: number } | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  // Côté serveur on suppose le navigateur compatible (sinon le bandeau d'avertissement
  // apparaîtrait au rendu serveur puis disparaîtrait : écart d'hydratation)
  const supported = useSyncExternalStore(noSubscription, () => "highlights" in CSS, () => true);

  const items = wheel?.kind === "emote" ? emoteItems : pingItems;

  // ---- Dessin des marques et placement des autocollants d'émotes ----
  useLayoutEffect(() => {
    if (!supported || !container.current) return;
    const groups = new Map<string, Range[]>();
    const add = (name: string, range: Range) => groups.set(name, [...(groups.get(name) ?? []), range]);
    const indexes = new Map<Element, ReturnType<typeof buildTextIndex>>();
    ranges.current.clear();

    const resolve = (messageId: string, anchor: Anchor) => {
      const root = container.current!.querySelector(`[data-annotatable="${messageId}"]`);
      if (!root) return null;
      if (!indexes.has(root)) indexes.set(root, buildTextIndex(root));
      return rangeFromAnchor(root, anchor, indexes.get(root));
    };

    const box = container.current.getBoundingClientRect();
    // Marge libre à droite de la colonne de texte ? Les autocollants s'y rangent (comme des commentaires)
    const inMargin = box.right + 48 < window.innerWidth;
    const perLine = new Map<string, number>();
    for (const a of annotations) {
      const range = resolve(a.message_id, a.anchor);
      if (!range) continue;
      ranges.current.set(a.id, range);
      if (a.kind === "reaction") {
        // Le passage est marqué d'un pointillé doré ; l'autocollant va dans la marge, à hauteur de la ligne
        // (ou, sans marge, au bout du passage, réduit et surélevé). Plusieurs réactions sur une ligne se rangent côte à côte.
        add("ann-reaction", range);
        const el = stickers.current.get(a.id);
        const rects = range.getClientRects();
        const last = rects[rects.length - 1];
        if (el && last) {
          const line = Math.round(last.top);
          const key = inMargin ? `m:${line}` : `${Math.round(last.right)}:${line}`;
          const rank = perLine.get(key) ?? 0;
          perLine.set(key, rank + 1);
          const size = inMargin ? 26 : 18;
          el.style.width = el.style.height = `${size}px`;
          el.style.left = `${(inMargin ? box.width + 10 : last.right - box.left + 1) + rank * (size + 2)}px`;
          el.style.top = `${last.top - box.top + (inMargin ? last.height / 2 - size / 2 : -size / 2)}px`;
          el.style.visibility = "visible";
        }
        continue;
      }
      add(a.kind === "highlight" ? `hl-${a.color ?? "yellow"}` : `ann-${a.kind}`, range);
    }
    if (composer) {
      const range = resolve(composer.target.messageId, composer.target.anchor);
      if (range) add("ann-pending", range);
    }
    if (menu) {
      const range = ranges.current.get(menu.annotation.id);
      if (range) add("ann-focus", range);
    }

    const names = ["hl-yellow", "hl-green", "hl-pink", "hl-blue", "ann-question", "ann-understanding", "ann-error", "ann-reaction", "ann-pending", "ann-focus"];
    for (const name of names) {
      const list = groups.get(name);
      if (list?.length) CSS.highlights.set(name, new Highlight(...list));
      else CSS.highlights.delete(name);
    }
  }, [annotations, composer, menu, version, supported, layoutTick]);

  // Les autocollants suivent le texte quand la mise en page change (largeur de fenêtre, panneaux…)
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(() => setLayoutTick((t) => t + 1));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  // Nettoyage en quittant la page du cours
  useEffect(() => () => CSS.highlights?.clear(), []);

  // ---- Effets visuels et sonores ----
  const spawn = useCallback((effect: EffectInput, sound: string) => {
    const id = Date.now() + Math.random();
    setEffects((list) => [...list, { ...effect, id }]);
    setTimeout(() => setEffects((list) => list.filter((e) => e.id !== id)), effect.type === "emote" ? 2700 : 1900);
    void playSound(sound);
  }, []);

  // Petit « clic » quand la part visée change, comme dans le jeu
  const lastHitIndex = useRef<number | null>(null);
  useEffect(() => {
    const index = hit?.index ?? null;
    if (wheel && index !== null && index !== lastHitIndex.current) {
      void playSound(pingSoundUrl(TICK_SOUND), 0.4);
      // L'animation (~1 Mo) se charge pendant qu'on vise : elle est prête au relâchement
      if (wheel.kind === "emote") preloadEmote(emoteItems[index].key);
    }
    lastHitIndex.current = index;
  }, [hit, wheel]);

  const closeWheel = useCallback(() => {
    setWheel(null);
    setHit(null);
  }, []);

  const execute = useCallback(
    async (state: WheelState, picked: WheelHit, at: { x: number; y: number }) => {
      closeWheel();
      window.getSelection()?.removeAllRanges();
      const { target } = state;

      if (state.kind === "emote") {
        const slug = emoteItems[picked.index].key;
        spawn({ type: "emote", slug, x: at.x, y: at.y }, emoteSoundUrl(slug));
        const tempId = `tmp-${Date.now()}`;
        setAnnotations((list) => [
          ...list,
          { id: tempId, message_id: target.messageId, kind: "reaction", color: null, emote: slug, anchor: target.anchor, note: null, status: "open", created_at: new Date().toISOString() },
        ]);
        const result = await createAnnotation({ messageId: target.messageId, kind: "reaction", emote: slug, anchor: target.anchor });
        setAnnotations((list) =>
          result.annotation ? list.map((a) => (a.id === tempId ? result.annotation! : a)) : list.filter((a) => a.id !== tempId),
        );
        if (result.error) setError(result.error);
        return;
      }

      const action = PING_ORDER[picked.index];
      spawn({ type: "ping", action, x: at.x, y: at.y }, pingSoundUrl(PINGS[action].sound));
      if (action !== "highlight") {
        setComposer({ kind: action, target });
        return;
      }
      const color = picked.color ?? lastColor;
      setLastColor(color);
      writePref(COLOR_KEY, color);
      // Affichage immédiat, remplacé par l'annotation enregistrée
      const tempId = `tmp-${Date.now()}`;
      setAnnotations((list) => [
        ...list,
        { id: tempId, message_id: target.messageId, kind: "highlight", color, anchor: target.anchor, note: null, status: "open", created_at: new Date().toISOString() },
      ]);
      const result = await createAnnotation({ messageId: target.messageId, kind: "highlight", color, anchor: target.anchor });
      setAnnotations((list) =>
        result.annotation ? list.map((a) => (a.id === tempId ? result.annotation! : a)) : list.filter((a) => a.id !== tempId),
      );
      if (result.error) setError(result.error);
    },
    [closeWheel, lastColor, spawn],
  );

  const hitAt = useCallback(
    (state: WheelState, x: number, y: number) =>
      hitTest(x - state.x, y - state.y, state.kind === "emote" ? emoteItems.length : pingItems.length, state.kind === "ping" ? HIGHLIGHT_SLICE : null, lastColor),
    [lastColor],
  );

  // ---- Gestes à la souris ----
  function onPointerDown(e: React.PointerEvent) {
    lastPointerType.current = e.pointerType;
    if (e.button !== 2 || e.shiftKey) return;
    const target = selectionTarget();
    if (!target) return;
    // Clic droit sur une sélection : la roue de pings s'ouvre sous le curseur, en mode glisser-relâcher
    e.preventDefault();
    suppressContextMenu.current = true;
    setMenu(null);
    setHit(null);
    setWheel({ kind: "ping", x: e.clientX, y: e.clientY, trigger: "right", target });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (e.button !== 0 || wheel || composer) return;
    const { clientX: x, clientY: y, pointerType } = e;
    // Laisse le navigateur finaliser la sélection avant de la lire
    setTimeout(() => {
      const target = selectionTarget();
      if (target) {
        setMenu(null);
        const at = pointerType === "touch" ? { x: target.rect.left + target.rect.width / 2, y: target.rect.bottom + 160 } : { x, y };
        setWheel({ kind: "ping", ...at, trigger: "click", target });
        return;
      }
      // Simple clic : sur une marque existante ? (la plus courte si plusieurs se chevauchent)
      const caret = caretAt(x, y);
      if (!caret) return setMenu(null);
      const hits = annotations.filter((a) => {
        if (a.kind === "reaction") return false; // une réaction s'ouvre par son autocollant
        const range = ranges.current.get(a.id);
        try {
          return range?.isPointInRange(caret.node, caret.offset) && range.toString().length > 0;
        } catch {
          return false;
        }
      });
      if (!hits.length) return setMenu(null);
      hits.sort((a, b) => a.anchor.quote.length - b.anchor.quote.length);
      setMenu({ annotation: hits[0], x, y });
    }, 0);
  }

  function onContextMenu(e: React.MouseEvent) {
    if (e.shiftKey) return;
    // Sous Windows, le menu contextuel arrive après le relâchement du clic droit
    if (suppressContextMenu.current || wheel || selectionTarget()) {
      e.preventDefault();
      suppressContextMenu.current = false;
    }
  }

  // Glisser pendant que le déclencheur est maintenu (clic droit, Alt ou Ctrl)
  useEffect(() => {
    if (!wheel || wheel.trigger === "click") return;
    const move = (e: PointerEvent) => setHit(hitAt(wheel, e.clientX, e.clientY));
    const release = (x: number, y: number) => {
      const picked = hitAt(wheel, x, y);
      const moved = Math.hypot(x - wheel.x, y - wheel.y) >= DRAG_THRESHOLD;
      if (picked && moved) void execute(wheel, picked, { x, y });
      // Clic droit sans glisser : la roue reste ouverte, cliquable. Touche relâchée au centre : on annule.
      else if (wheel.trigger === "right") setWheel((w) => (w ? { ...w, trigger: "click" } : w));
      else closeWheel();
    };
    const up = (e: PointerEvent) => {
      if (wheel.trigger === "right" && e.button === 2) release(e.clientX, e.clientY);
    };
    const keyup = (e: KeyboardEvent) => {
      if ((wheel.trigger === "alt" && e.key === "Alt") || (wheel.trigger === "ctrl" && e.key === "Control")) {
        e.preventDefault();
        release(pointer.current.x, pointer.current.y);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keyup", keyup);
    };
  }, [wheel, hitAt, execute, closeWheel]);

  // ---- Raccourcis clavier façon lolPing : Alt = pings, Ctrl = émotes ----
  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      const arm = armed.current;
      if (!arm || wheel || composer) return;
      if (Math.hypot(e.clientX - arm.x, e.clientY - arm.y) < KEY_MOVE_THRESHOLD) return;
      armed.current = null;
      // La sélection si elle existe, sinon le mot sous le pointeur au moment où la touche a été enfoncée
      const target = selectionTarget() ?? wordTarget(arm.x, arm.y);
      if (!target) return;
      setMenu(null);
      setHit(null);
      setWheel({ kind: arm.kind, x: arm.x, y: arm.y, trigger: arm.trigger, target });
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const onlyAlt = e.key === "Alt" && !e.ctrlKey && !e.shiftKey && !e.metaKey;
      const onlyCtrl = e.key === "Control" && !e.altKey && !e.shiftKey && !e.metaKey;
      if (onlyAlt || onlyCtrl) {
        if (onlyAlt) e.preventDefault(); // évite l'activation de la barre de menu du navigateur
        armed.current = { kind: onlyAlt ? "ping" : "emote", trigger: onlyAlt ? "alt" : "ctrl", ...pointer.current };
        return;
      }
      // Une autre touche pendant Alt/Ctrl (Ctrl+C, Alt+Tab…) : c'est un raccourci, pas une roue
      armed.current = null;
      if (wheel && (wheel.trigger === "alt" || wheel.trigger === "ctrl")) closeWheel();
      if (e.key === "Escape") {
        closeWheel();
        setMenu(null);
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.key === "Alt" || e.key === "Control") armed.current = null;
    };
    const blur = () => {
      armed.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
    };
  }, [wheel, composer, closeWheel]);

  // Sélection au doigt (mobile) : la roue apparaît une fois la sélection stabilisée
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const change = () => {
      if (lastPointerType.current !== "touch") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const target = selectionTarget();
        if (target && !composer) {
          setWheel({ kind: "ping", x: target.rect.left + target.rect.width / 2, y: target.rect.bottom + 160, trigger: "click", target });
        }
      }, 600);
    };
    document.addEventListener("selectionchange", change);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", change);
    };
  }, [composer]);

  async function removeAnnotation(annotation: AnnotationRow) {
    setMenu(null);
    setAnnotations((list) => list.filter((a) => a.id !== annotation.id));
    await deleteAnnotation(annotation.id);
  }

  async function recolor(annotation: AnnotationRow, color: HighlightColor) {
    setAnnotations((list) => list.map((a) => (a.id === annotation.id ? { ...a, color } : a)));
    setMenu((m) => (m ? { ...m, annotation: { ...m.annotation, color } } : m));
    setLastColor(color);
    writePref(COLOR_KEY, color);
    await updateHighlightColor(annotation.id, color);
  }

  const switchKind = () =>
    setWheel((w) => (w ? { ...w, kind: w.kind === "ping" ? "emote" : "ping", trigger: "click" } : w));

  return (
    <div ref={container} className="relative" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onContextMenu={onContextMenu}>
      <style>{HIGHLIGHT_CSS}</style>
      {!supported && (
        <p className="mb-4 rounded-xl bg-amber-500/10 px-4 py-2 text-sm">
          Ton navigateur ne permet pas d&apos;afficher les annotations. Mets-le à jour (Chrome, Edge, Safari ou Firefox récents).
        </p>
      )}
      {children}

      {/* Réactions : autocollants d'émotes au bout des passages (placés par l'effet de mise en page) */}
      {annotations
        .filter((a) => a.kind === "reaction" && a.emote)
        .map((a) => (
          <button
            key={a.id}
            ref={(el) => {
              if (el) stickers.current.set(a.id, el);
              else stickers.current.delete(a.id);
            }}
            type="button"
            {...stopGestures}
            onClick={(e) => setMenu({ annotation: a, x: e.clientX, y: e.clientY })}
            title={emoteLabel(a.emote!)}
            aria-label={`Réaction : ${emoteLabel(a.emote!)}`}
            className="group absolute z-10 rounded-full transition hover:z-20 hover:scale-[2.2]"
            style={{ visibility: "hidden" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- petite image fixe, animée au survol */}
            <img src={emoteStillUrl(a.emote!)} alt="" className="h-full w-full rounded-full group-hover:hidden" draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element -- animation chargée seulement au survol */}
            <img src={emoteAnimUrl(a.emote!)} alt="" loading="lazy" className="hidden h-full w-full rounded-full group-hover:block" draggable={false} />
          </button>
        ))}

      {wheel && (
        <>
          {/* Mode clic : un clic à côté de la roue la ferme */}
          {wheel.trigger === "click" && (
            <div
              className="fixed inset-0 z-40"
              onPointerDown={(e) => {
                e.stopPropagation();
                closeWheel();
                // Sinon la sélection toujours active rouvrirait la roue au relâchement du clic
                window.getSelection()?.removeAllRanges();
              }}
              onPointerUp={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            />
          )}
          <div {...stopGestures}>
            <Wheel
              x={wheel.x}
              y={wheel.y}
              items={items}
              hit={hit}
              colorSlice={wheel.kind === "ping" ? HIGHLIGHT_SLICE : null}
              lastColor={lastColor}
              interactive={wheel.trigger === "click"}
              ariaLabel={wheel.kind === "ping" ? "Actions sur la sélection" : "Réactions"}
              onHover={setHit}
              onPick={(picked) => void execute(wheel, picked, { x: wheel.x, y: wheel.y })}
              footer={
                wheel.trigger === "click" ? (
                  <button
                    type="button"
                    onClick={switchKind}
                    className="rounded-full border border-[#785a28] bg-[#0a1016] px-3 py-1 text-xs font-semibold text-[#c8aa6e] shadow-lg hover:text-[#f0e6d2]"
                  >
                    {wheel.kind === "ping" ? "😀 Réactions (Ctrl)" : "📍 Actions (Alt)"}
                  </button>
                ) : null
              }
            />
          </div>
        </>
      )}

      {effects.map((fx) =>
        fx.type === "ping" ? <PingFx key={fx.id} x={fx.x} y={fx.y} action={fx.action} /> : <EmoteFx key={fx.id} x={fx.x} y={fx.y} slug={fx.slug} />,
      )}

      {composer && (
        <ComposerPopover
          composer={composer}
          onCancel={() => setComposer(null)}
          onSaved={(annotation) => {
            setAnnotations((list) => [...list, annotation]);
            setComposer(null);
          }}
        />
      )}

      {menu && <AnnotationMenu state={menu} onClose={() => setMenu(null)} onDelete={removeAnnotation} onRecolor={recolor} />}

      {error && (
        <div role="alert" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-3 opacity-80 hover:opacity-100" aria-label="Fermer">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/** Position d'une fenêtre flottante sous un passage, sans sortir de l'écran. */
function popoverPosition(rect: DOMRect, width: number, height: number) {
  const left = Math.min(Math.max(rect.left, 12), window.innerWidth - width - 12);
  const below = rect.bottom + 10;
  const top = below + height > window.innerHeight - 12 ? Math.max(12, rect.top - height - 10) : below;
  return { left, top, width };
}

function ComposerPopover({
  composer,
  onCancel,
  onSaved,
}: {
  composer: Composer;
  onCancel: () => void;
  onSaved: (annotation: AnnotationRow) => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COMPOSER_TEXT[composer.kind];
  const ping = PINGS[composer.kind];
  const width = Math.min(380, window.innerWidth - 24);
  const required = composer.kind !== "error";

  async function save() {
    if (required && !text.trim()) return;
    setSaving(true);
    const result = await createAnnotation({ messageId: composer.target.messageId, kind: composer.kind, anchor: composer.target.anchor, text });
    setSaving(false);
    if (result.error || !result.annotation) return setError(result.error ?? "Erreur inattendue.");
    onSaved(result.annotation);
  }

  return (
    <>
      <div className="fixed inset-0 z-40" {...stopGestures} onPointerDown={(e) => { e.stopPropagation(); onCancel(); }} />
      <div
        {...stopGestures}
        className="fixed z-50 rounded-2xl border border-black/10 bg-[var(--background)] p-4 shadow-2xl dark:border-white/15"
        style={popoverPosition(composer.target.rect, width, 250)}
        role="dialog"
        aria-label={PING_LABELS[composer.kind]}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
        }}
      >
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: ping.color }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- icône du ping */}
          <img src={pingIconUrl(ping.icon)} alt="" className="h-6 w-6" />
          {PING_LABELS[composer.kind]}
        </div>
        <blockquote className="mb-3 line-clamp-2 border-l-2 border-black/15 pl-2 text-xs italic opacity-60 dark:border-white/20">
          {composer.target.anchor.quote}
        </blockquote>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={copy.placeholder}
          maxLength={4000}
          rows={3}
          className="w-full resize-none rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/20"
        />
        <p className="mt-1 text-xs opacity-50">{copy.hint}</p>
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm opacity-70 hover:opacity-100">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (required && !text.trim())}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: ping.color }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </>
  );
}

function AnnotationMenu({
  state,
  onClose,
  onDelete,
  onRecolor,
}: {
  state: MenuState;
  onClose: () => void;
  onDelete: (a: AnnotationRow) => void;
  onRecolor: (a: AnnotationRow, color: HighlightColor) => void;
}) {
  const { annotation } = state;
  const width = Math.min(320, window.innerWidth - 24);
  const rect = new DOMRect(state.x - 20, state.y, 0, 12);
  const text = annotation.kind === "question" ? annotation.thread_messages?.find((m) => m.role === "user")?.content : annotation.note;

  return (
    <>
      <div className="fixed inset-0 z-40" {...stopGestures} onPointerDown={(e) => { e.stopPropagation(); onClose(); }} />
      <div
        {...stopGestures}
        className="fixed z-50 rounded-2xl border border-black/10 bg-[var(--background)] p-3 shadow-2xl dark:border-white/15"
        style={popoverPosition(rect, width, 200)}
        role="dialog"
        aria-label={KIND_LABEL[annotation.kind]}
      >
        <p className="text-xs font-semibold uppercase tracking-wide opacity-50">{KIND_LABEL[annotation.kind]}</p>
        {annotation.kind === "reaction" && annotation.emote && (
          <div className="mt-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- émote animée */}
            <img src={emoteAnimUrl(annotation.emote)} alt="" className="h-14 w-14 rounded-full" />
            <span className="text-sm font-medium">{emoteLabel(annotation.emote)}</span>
          </div>
        )}
        {annotation.kind !== "highlight" && annotation.kind !== "reaction" && (
          <blockquote className="mt-2 line-clamp-2 border-l-2 border-black/15 pl-2 text-xs italic opacity-60 dark:border-white/20">
            {annotation.anchor.quote}
          </blockquote>
        )}
        {text && <p className="mt-2 whitespace-pre-wrap text-sm">{text}</p>}
        {annotation.kind === "question" && (
          <p className="mt-2 text-xs opacity-50">La réponse de l&apos;IA dans la marge arrive avec la prochaine mise à jour.</p>
        )}
        {annotation.kind === "highlight" && (
          <div className="mt-2 flex gap-2">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onRecolor(annotation, color)}
                aria-label={`Couleur ${color}`}
                className={`h-6 w-6 rounded-full border-2 ${annotation.color === color ? "border-[var(--foreground)]" : "border-transparent"}`}
                style={{ backgroundColor: HIGHLIGHT_SWATCH[color] }}
              />
            ))}
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => onDelete(annotation)}
            disabled={annotation.id.startsWith("tmp-")}
            className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400"
          >
            Supprimer
          </button>
        </div>
      </div>
    </>
  );
}
