"use client";
import { fileDownloadTransport } from "./transports/file-download";
import { shareLinkTransport } from "./transports/share-link";
import type { NotebookTransport, NotebookTransportId } from "./transports/types";

const REGISTRY: Record<NotebookTransportId, NotebookTransport> = {
  "file-download": fileDownloadTransport,
  "share-link":    shareLinkTransport,
};

export function getNotebookTransport(id: NotebookTransportId): NotebookTransport {
  return REGISTRY[id] ?? fileDownloadTransport;
}

export function listNotebookTransports(): NotebookTransport[] {
  return Object.values(REGISTRY);
}
