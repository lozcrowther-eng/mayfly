import { NextResponse } from "next/server";
import { killInstance } from "@/lib/api/kill-instance";

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const killed = await killInstance(runId);
  if (!killed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
