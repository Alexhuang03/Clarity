import { assertUuid, handle, requireCourse } from "@/lib/study/http";
import { deleteSheet, getSheet } from "@/lib/study/sheets";
import type { SheetResponse } from "@/lib/study/types";

type Ctx = { params: Promise<{ id: string; sheetId: string }> };

export function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    const sheet = await getSheet(session, assertUuid((await params).sheetId, "Fiche"));
    return Response.json({ sheet } satisfies SheetResponse);
  });
}

export function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    await deleteSheet(session, assertUuid((await params).sheetId, "Fiche"));
    return Response.json({ ok: true });
  });
}
