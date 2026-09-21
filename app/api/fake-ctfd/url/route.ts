import { NextResponse } from "next/server";
import { fakePublishUrl } from "@/lib/ctfd/fake-store";

export async function PATCH(request: Request) {
  if (process.env.CTFD_MODE !== "fake") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { challengeId, teamId, runId, url } = await request.json();
  fakePublishUrl({ challengeId, teamId, runId }, url);

  return NextResponse.json({ ok: true });
}
