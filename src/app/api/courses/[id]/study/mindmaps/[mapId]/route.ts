import { assertUuid, handle, requireCourse } from "@/lib/study/http";
import { deleteMindMap, getMindMap } from "@/lib/study/mindmaps";
import type { MindMapResponse } from "@/lib/study/types";

type Ctx = { params: Promise<{ id: string; mapId: string }> };

export function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const mindmap = await getMindMap(session, assertUuid((await params).mapId, "Carte mentale"));
    return Response.json({ mindmap } satisfies MindMapResponse);
  });
}

export function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    await deleteMindMap(session, assertUuid((await params).mapId, "Carte mentale"));
    return Response.json({ ok: true });
  });
}
