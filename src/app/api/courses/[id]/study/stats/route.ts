import { handle, requireCourse } from "@/lib/study/http";
import { courseStats } from "@/lib/study/stats";
import type { StatsResponse } from "@/lib/study/types";

type Ctx = { params: Promise<{ id: string }> };

/** Progression : maîtrise par notion, notions faibles, totaux, dernières tentatives. */
export function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireCourse(params);
    return Response.json((await courseStats(session)) satisfies StatsResponse);
  });
}
