import { connection } from "next/server";
import { fakeCtfdEvents } from "@/lib/ctfd/fake-store";

// Reads live in-memory state on every request. `await connection()` is what actually forces
// that under Cache Components — force-dynamic is gone, and without a dynamic API in the
// render path this would otherwise prerender once at build time and freeze the event list.
// No static shell worth prerendering either, so this also opts out of the instant-navigation
// requirement rather than carving out a Suspense boundary for content that's all dynamic.
export const instant = false;

export default async function DebugPage() {
  await connection();
  const ctfdMode = process.env.CTFD_MODE;
  const events = ctfdMode === "fake" ? fakeCtfdEvents() : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold text-foreground">Fake CTFd — received calls</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {ctfdMode === "fake"
          ? `${events.length} event(s), newest first.`
          : `CTFD_MODE is '${ctfdMode ?? "(unset)"}' — the fake CTFd endpoints are inactive.`}
      </p>

      <div className="mt-6 divide-y divide-border rounded-lg ring-1 ring-border">
        {events.length === 0 && ctfdMode === "fake" && (
          <p className="px-4 py-6 text-sm text-muted-foreground">No calls received yet.</p>
        )}
        {events.map((event) => (
          <div key={event.id} className="px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono font-medium text-foreground">{event.kind}</span>
              <time className="text-xs text-muted-foreground" dateTime={event.receivedAt}>
                {event.receivedAt}
              </time>
            </div>
            <p className="mt-1 text-muted-foreground">
              {event.challengeId} / {event.teamId} / {event.runId}
            </p>
            {Object.keys(event.detail).length > 0 && (
              <pre className="mt-2 overflow-x-auto rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
                {JSON.stringify(event.detail, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
