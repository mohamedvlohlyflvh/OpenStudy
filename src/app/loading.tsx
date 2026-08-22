import { PageLoader } from "@/components/page-loader";

/* Root loading.tsx is the OUTERMOST Suspense boundary — it streams as
   the fallback for every cold load, so it must be route-agnostic.
   Route-specific loaders live in each segment's own loading.tsx. */
export default function Loading() {
  return <PageLoader variant="generic" testId="root" />;
}
