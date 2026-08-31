"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Pencil, Layers } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Modal, Input, EmptyState, Skeleton } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import { showUndo } from "@/components/undo-toast";
import { getBundles, createBundle, updateBundle, deleteBundle } from "@/app/actions";
import { BundleColorPicker } from "@/components/bundle-color-picker";
import { AiImportButton } from "@/components/ai-import-button";
import { spotlightProps } from "@/lib/interactions";

type Bundle = Awaited<ReturnType<typeof getBundles>>[number];

export default function BundlesPage() {
  const router = useRouter();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("#DFE104");

  // Edit modal
  const [editBundle, setEditBundle] = useState<Bundle | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("#DFE104");

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Bundle | null>(null);


  useEffect(() => {
    getBundles().then((b) => {
      setBundles(b);
      setLoaded(true);
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setCreateOpen(true);
      }
      if (e.key === "Escape") {
        setCreateOpen(false);
        setEditBundle(null);
        setDeleteTarget(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const bundle = await createBundle({ name: newName.trim(), description: newDesc.trim() || undefined, color: newColor });
      setBundles((prev) => [{ ...bundle, _count: { flashcards: 0 } }, ...prev]);
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      setNewColor("#DFE104");
    } catch (e) {
      console.error("Failed to create bundle:", e);
      alert("FAILED TO CREATE BUNDLE. CHECK CONSOLE FOR DETAILS.");
    }
  };

  const handleEdit = async () => {
    if (!editBundle || !editName.trim()) return;
    setLoading(true);
    try {
      await updateBundle(editBundle.id, { name: editName.trim(), description: editDesc.trim() || undefined, color: editColor });
      setBundles((prev) =>
        prev.map((b) => (b.id === editBundle.id ? { ...b, name: editName.trim(), description: editDesc.trim() || null, color: editColor } : b))
      );
      setEditBundle(null);
    } catch (e) {
      console.error("Failed to edit bundle:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const snapshot = deleteTarget;
    setDeleteTarget(null); // close modal immediately
    // Optimistically remove from UI. The real DB delete fires via the
    // toast's onCommit (module-scoped timer) so UNDO cancels it reliably
    // even if you navigate away — no page-closure cancellation bug.
    setBundles((prev) => prev.filter((b) => b.id !== snapshot.id));
    showUndo({
      message: `BUNDLE "${snapshot.name}" DELETED`,
      duration: 5000,
      undo: async () => {
        // Restore into UI list (re-fetch to get fresh state)
        const fresh = await getBundles();
        setBundles(fresh);
      },
      onCommit: async () => {
        try {
          await deleteBundle(snapshot.id);
        } catch (e) {
          console.error("Failed to delete bundle:", e);
        }
      },
    });
  };

  return (
    <div className="p-8 lg:p-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-end justify-between">
          <div>
            <RevealHeading text="BUNDLES" className="text-4xl lg:text-6xl" />
            <ScrambleSubtitle
              text="FLASHCARD DECKS FOR YOUR STUDY MATERIAL"
              className="mt-2 text-sm text-muted-fg uppercase tracking-widest"
            />
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            NEW BUNDLE
          </Button>
        </div>
      </div>

      {/* Grid */}
      {!loaded ? (
        <div className="grid gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-2 border-border bg-bg p-6">
              <Skeleton className="h-12 w-12 mb-4" />
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      ) : bundles.length === 0 ? (
        <EmptyState
          icon={<Layers size={48} />}
          title="NO BUNDLES YET"
          description="CREATE YOUR FIRST BUNDLE TO START ORGANIZING FLASHCARDS."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              CREATE BUNDLE
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
          {bundles.map((bundle) => (
            <Link
              key={bundle.id}
              href={`/flashcards?bundle=${bundle.id}`}
              {...spotlightProps()}
              className="spotlight-card group relative flex h-72 w-full max-w-xs flex-col justify-between overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 text-left transition-all duration-200 hover:-translate-y-1 hover:border-yellow-400/50 hover:bg-zinc-900 hover:shadow-[0_18px_45px_-15px_rgba(250,204,21,0.25)]"
            >
              {/* top accent strip in the bundle's color */}
              <span
                className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl"
                style={{ backgroundColor: bundle.color || "#DFE104", boxShadow: `0 0 12px ${bundle.color || "#DFE104"}55` }}
              />

              {/* Header: icon + quick actions */}
              <div className="flex items-start justify-between">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-black transition-transform duration-200 group-hover:scale-110"
                  style={{
                    backgroundColor: `${bundle.color || "#DFE104"}1f`,
                    color: bundle.color || "#DFE104",
                    boxShadow: `inset 0 0 0 1px ${(bundle.color || "#DFE104")}3d`,
                  }}
                >
                  {bundle.name.charAt(0)}
                </div>
                <div className="flex -mr-2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.preventDefault()}>
                  <span onClick={(e) => e.stopPropagation()}>
                    <AiImportButton bundleId={bundle.id} bundleName={bundle.name} />
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      router.push(`/flashcards?bundle=${bundle.id}&mode=gallery`);
                    }}
                    aria-label="Manage cards"
                    title="Manage cards"
                    className="flex items-center gap-1 px-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-yellow-400"
                  >
                    <Layers size={13} />
                    Manage
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setEditBundle(bundle);
                      setEditName(bundle.name);
                      setEditDesc(bundle.description || "");
                      setEditColor(bundle.color);
                    }}
                    aria-label="Edit bundle"
                    className="p-2.5 text-zinc-400 hover:text-yellow-400"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDeleteTarget(bundle);
                    }}
                    aria-label="Delete bundle"
                    className="p-2.5 text-zinc-400 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="mt-3 min-w-0">
                <h3 className="truncate text-xl font-bold text-white transition-colors group-hover:text-yellow-400">
                  {bundle.name}
                </h3>
                {bundle.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-zinc-400">
                    {bundle.description}
                  </p>
                )}
              </div>

              {/* Footer — always-visible actions */}
              <div className="flex items-center justify-between gap-2" onClick={(e) => e.preventDefault()}>
                <span
                  className="rounded-full px-2.5 py-1 font-mono text-xs"
                  style={{ backgroundColor: `${bundle.color || "#DFE104"}14`, color: bundle.color || "#DFE104" }}
                >
                  {bundle._count.flashcards} CARD{bundle._count.flashcards !== 1 ? "S" : ""}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      router.push(`/bundles/${bundle.id}/cards`);
                    }}
                    className="py-2 text-xs font-bold uppercase tracking-widest text-yellow-400 hover:underline"
                  >
                    Manage cards
                  </button>
                  {bundle._count.flashcards > 0 && (
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 group-hover:underline">
                      Study →
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="NEW BUNDLE">
        <div className="space-y-6">
          <Input label="BUNDLE NAME" placeholder="E.G. IELTS VOCABULARY" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input label="DESCRIPTION (OPTIONAL)" placeholder="BRIEF DESCRIPTION..." value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <BundleColorPicker value={newColor} onChange={setNewColor} />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>CANCEL</Button>
            <Button onClick={handleCreate} disabled={loading || !newName.trim()}>
              {loading ? "CREATING..." : "CREATE"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editBundle} onClose={() => setEditBundle(null)} title="EDIT BUNDLE">
        {editBundle && (
          <div className="space-y-6">
            <Input label="BUNDLE NAME" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Input label="DESCRIPTION (OPTIONAL)" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            <BundleColorPicker value={editColor} onChange={setEditColor} />
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="ghost" onClick={() => setEditBundle(null)}>CANCEL</Button>
              <Button onClick={handleEdit} disabled={loading || !editName.trim()}>SAVE</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="DELETE BUNDLE">
        {deleteTarget && (
          <div className="space-y-6">
            <p className="text-sm text-muted-fg">
              DELETE &quot;{deleteTarget.name.toUpperCase()}&quot; AND ALL ITS FLASHCARDS? THIS CANNOT BE UNDONE.
            </p>
            <div className="flex justify-end gap-4 pt-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>CANCEL</Button>
              <Button variant="danger" onClick={handleDelete} disabled={loading}>DELETE</Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
