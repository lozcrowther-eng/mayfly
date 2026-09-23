import { checkRunToken } from "@/lib/api/require-run-token";
import { resumeLifecycle } from "@/lib/api/resume-lifecycle";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const unauthorized = checkRunToken(request, runId);
  if (unauthorized) return unauthorized;
  return resumeLifecycle(runId, "stopped");
}
