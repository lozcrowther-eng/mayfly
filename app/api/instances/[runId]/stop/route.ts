import { resumeLifecycle } from "@/lib/api/resume-lifecycle";

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return resumeLifecycle(runId, "stopped");
}
