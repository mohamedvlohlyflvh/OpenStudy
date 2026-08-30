"use client";
import type { NotebookTransport, NotebookTransportResult } from "./types";
import type { NotebookSourceInput } from "../schema";
import { useAppStore } from "@/lib/store";

const ENDPOINT = "https://dpaste.com/api/v2/";

export const shareLinkTransport: NotebookTransport = {
  id: "share-link",
  label: "Create share link",
  requiresNetwork: true,
  isAvailable: () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return false;
    // Read the Settings toggle. The store is hydrated post-mount; before
    // hydration the default (false) is the safe answer.
    try {
      return useAppStore.getState().notebookShareLinkEnabled === true;
    } catch {
      return false;
    }
  },
  async send(input: NotebookSourceInput, body: string): Promise<NotebookTransportResult> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { ok: false, message: "You're offline. Use the Download .md path instead." };
    }
    try {
      const form = new FormData();
      form.set("content", body);
      form.set("syntax", "markdown");
      form.set("title", input.title);
      form.set("expiry_days", "30");

      const res = await fetch(ENDPOINT, { method: "POST", body: form });
      if (!res.ok) return { ok: false, message: `Paste service returned ${res.status}` };
      const url = (await res.text()).trim();
      if (!/^https?:\/\//.test(url)) {
        return { ok: false, message: "Unexpected response from paste service." };
      }
      return {
        ok: true,
        message: "Share link created. Open NotebookLM and add it as a Website source.",
        shareUrl: url,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
};
