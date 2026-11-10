import { handle, readBody, requireCourse, requireCourseContext } from "@/lib/study/http";
import { createMindMap, createMindMapSchema, listMindMaps } from "@/lib/study/mindmaps";
import type { MindMapResponse, MindMapSummary } from "@/lib/study/types";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    return Response.json({ mindmaps: await listMindMaps(session) } satisfies { mindmaps: MindMapSummary[] });
  });
}

/** Génère une carte mentale (arbre JSON) du cours ou d'une sélection. */
export function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourseContext(params);
    const body = await readBody(request, createMindMapSchema);
    return Response.json({ mindmap: await createMindMap(session, body) } satisfies MindMapResponse, { status: 201 });
  });
}
