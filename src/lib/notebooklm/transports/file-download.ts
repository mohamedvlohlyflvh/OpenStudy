"use client";
import type { NotebookTransport, NotebookTransportResult } from "./types";
import type { NotebookSourceInput } from "../schema";
import { sourceFilename } from "../format";

export const fileDownloadTransport: NotebookTransport = {
  id: "file-download",
  label: "Download as .md",
  requiresNetwork: false,
  isAvailable: () => true,
  async send(input: NotebookSourceInput, body: string): Promise<NotebookTransportResult> {
    if (typeof document === "undefined") {
      return { ok: false, message: "File download requires a browser context." };
    }
    try {
      const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = sourceFilename(input.title);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return { ok: true, message: "Downloaded. Open NotebookLM and upload the file as a source." };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
};
