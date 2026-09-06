"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getBundle, getBundleCards, exportBundle } from "@/app/actions";

// Direct share link: /share/{bundleId}
// Fetches the bundle, encodes it as a share payload, and redirects to /share#{hash}
// where the existing share page handles the import UI.
export default function ShareBundlePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "redirecting" | "not_found" | "empty">("loading");

  useEffect(() => {
    const bundleId = params.id;
    if (!bundleId) { setStatus("not_found"); return; }

    exportBundle(bundleId)
      .then((json) => {
        const payload = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        router.push(`/share#${payload}`);
      })
      .catch(() => setStatus("not_found"));
  }, [params.id]);

  if (status === "not_found") {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-2xl font-bold uppercase">BUNDLE NOT FOUND</h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted-fg">
          THIS BUNDLE MAY HAVE BEEN DELETED OR THE LINK IS INVALID.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-12 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">
        LOADING SHARED DECK…
      </p>
    </div>
  );
}
