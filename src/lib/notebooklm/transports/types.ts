import type { NotebookSourceInput } from "../schema";

export type NotebookTransportId = "file-download" | "share-link";

export interface NotebookTransportResult {
  ok: boolean;
  message: string;
  /** For transports that produce a URL (share-link only). */
  shareUrl?: string;
}

export interface NotebookTransport {
  readonly id: NotebookTransportId;
  readonly label: string;
  readonly requiresNetwork: boolean;
  /** Whether this transport can currently be used (e.g. share-link needs toggle + online). */
  isAvailable(): boolean | Promise<boolean>;
  send(input: NotebookSourceInput, body: string): Promise<NotebookTransportResult>;
}