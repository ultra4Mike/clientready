import { driveTime } from "@/lib/drive-time-handler";

export const dynamic = "force-dynamic";

/** GET /api/drive-time — see src/lib/drive-time-handler.ts (signed-in owner or crew only, rate limited). */
export async function GET(request: Request) {
  return driveTime(request);
}
