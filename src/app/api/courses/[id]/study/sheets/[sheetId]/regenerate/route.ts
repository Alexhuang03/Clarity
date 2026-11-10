import { assertUuid, handle, requireCourseContext } from "@/lib/study/http";
import { regenerateSheet } from "@/lib/study/sheets";
import type { SheetResponse } from "@/lib/study/types";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; sheetId: string }> };

/** Régénère le contenu de la fiche (même périmètre, même titre). */
export function POST(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourseContext(params);
    const sheetId = assertUuid((await params).sheetId, "Fiche");
    return Response.json({ sheet: await regenerateSheet(session, sheetId) } satisfies SheetResponse);
  });
}
