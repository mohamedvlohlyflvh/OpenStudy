import { z } from "zod";

export const NotebookSourceKind = z.enum(["subject", "bundle", "notes-set", "full-export"]);
export type NotebookSourceKind = z.infer<typeof NotebookSourceKind>;

export const NotebookSourceInput = z.object({
  kind: NotebookSourceKind,
  sourceId: z.string().min(1),            // subject id, bundle id, comma-separated note ids, or "all"
  title: z.string().min(1).max(120),
  includeCards: z.boolean().default(true),
  includeNotes: z.boolean().default(true),
  includeSessions: z.boolean().default(false),
});
export type NotebookSourceInput = z.infer<typeof NotebookSourceInput>;

export const NotebookExportRec = z.object({
  id: z.string(),
  kind: NotebookSourceKind,
  sourceId: z.string(),
  title: z.string(),
  byteSize: z.number().int().nonnegative(),
  transport: z.enum(["file-download", "share-link"]),
  shareUrl: z.string().url().optional(),  // populated only for share-link
  createdAt: z.date(),
});
export type NotebookExportRec = z.infer<typeof NotebookExportRec>;

export const NotebookSettings = z.object({
  id: z.literal("singleton"),
  shareLinkEnabled: z.boolean().default(false),
});
export type NotebookSettings = z.infer<typeof NotebookSettings>;