"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps page content and re-mounts it on every route change, replaying the
 * CSS `.page-enter` glide (globals.css). Keyed by pathname so React tears
 * down and rebuilds the subtree per navigation — zero JS animation cost.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
