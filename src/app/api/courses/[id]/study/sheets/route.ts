import { handle, readBody, requireCourse, requireCourseContext } from "@/lib/study/http";
import { createSheet, createSheetSchema, listSheets } from "@/lib/study/sheets";
import type { SheetResponse, SheetSummary } from "@/lib/study/types";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    return Response.json({ sheets: await listSheets(session) } satisfies { sheets: SheetSummary[] });
  });
}

/** Génère une fiche de révision (tout le cours ou une sélection). */
export function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourseContext(params);
    const body = await readBody(request, createSheetSchema);
    return Response.json({ sheet: await createSheet(session, body) } satisfies SheetResponse, { status: 201 });
  });
}
