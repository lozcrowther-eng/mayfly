import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Vercel's own Deployment Protection (a custom password on production) is a Pro-plan
// feature -- this project is Hobby (confirmed via the OIDC token payload), so it isn't
// available here. Basic Auth in Proxy is the always-available equivalent.
//
// The matcher below excludes everything that's a real server-to-server caller, not a
// browser with a session: CTFd's HMAC-signed /api/instances contract (see
// ctfd_mayfly/client.py), the HMAC-signed submission webhook, and the Workflow SDK's own
// /.well-known endpoints. None of those can answer a login prompt, and they're already
// authenticated by their own signature check -- gating them behind Basic Auth too would
// just break the live integration for no security benefit.
export function proxy(request: NextRequest) {
  const user = process.env.MAYFLY_BASIC_AUTH_USER;
  const password = process.env.MAYFLY_BASIC_AUTH_PASSWORD;

  // Unset in an environment (e.g. local dev) -- no gate, not a lockout.
  if (!user || !password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const providedUser = decoded.slice(0, separatorIndex);
    const providedPassword = decoded.slice(separatorIndex + 1);
    if (providedUser === user && providedPassword === password) {
      return NextResponse.next();
    }
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Mayfly"' },
  });
}

export const config = {
  matcher: ["/((?!api/instances|api/webhooks|\\.well-known|_next/static|_next/image|favicon.ico).*)"],
};
