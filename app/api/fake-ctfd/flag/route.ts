import { NextResponse } from "next/server";
import { fakeMintFlag } from "@/lib/ctfd/fake-store";

export async function POST(request: Request) {
  if (process.env.CTFD_MODE !== "fake") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { challengeId, teamId, runId } = await request.json();
  const flag = fakeMintFlag({ challengeId, teamId, runId });

  return NextResponse.json({ flag });
}
