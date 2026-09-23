"use client";

import Script from "next/script";
import { useState } from "react";
import { NavLinks } from "@/components/nav-links";

const SWAGGER_UI_VERSION = "5.17.14";

// Loaded from a CDN rather than the swagger-ui-react npm package — this is a reference/tool
// page, not one of the operator console's own dark/zinc/mono surfaces, so it's fine (and
// simpler, with no React-version compatibility risk) to let it render as its own standard
// self rather than trying to force a reskin onto a third-party widget's internals.
export default function ApiDocsPage() {
  const [ready, setReady] = useState(false);

  return (
    <div className="dark flex min-h-screen flex-col bg-black">
      <NavLinks />
      <link rel="stylesheet" href={`https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css`} />
      <Script
        src={`https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js`}
        strategy="afterInteractive"
        onReady={() => {
          setReady(true);
          // @ts-expect-error -- global injected by the CDN bundle, not a typed import
          window.SwaggerUIBundle({
            url: "/openapi.yaml",
            dom_id: "#swagger-ui",
            presets: [
              // @ts-expect-error -- same global
              window.SwaggerUIBundle.presets.apis,
            ],
          });
        }}
      />
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <header className="mb-4 flex flex-col gap-1">
          <h1 className="font-mono text-sm tracking-[0.3em] text-zinc-500">API DOCS</h1>
          <p className="text-sm text-zinc-400">
            The orchestrator&apos;s real API surface — OpenAPI 3.1, served from{" "}
            <a href="/openapi.yaml" className="underline hover:text-zinc-200">
              /openapi.yaml
            </a>
            . Excludes /api/fake-ctfd/* (CTFD_MODE=fake test scaffolding, not a real integration surface).
          </p>
        </header>
        {!ready && <p className="font-mono text-xs text-zinc-500">Loading…</p>}
        <div id="swagger-ui" className="rounded-lg bg-white p-2" />
      </div>
    </div>
  );
}
