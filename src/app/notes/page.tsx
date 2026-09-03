"use client";

import { useState, useEffect, useTransition, Suspense } from "react";
import { Plus, Trash2, Pin, StickyNote, Pencil, Eye, BookOpen, Search, X } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, Button, Modal, Input, EmptyState, Skeleton, Textarea } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import { getAllNotes, getSubjects, createNote, deleteNote, updateNote, getBundles } from "@/app/actions";
import { SubjectTopicSelect } from "@/components/subject-topic-select";
import { TagInput } from "@/components/tag-input";
import { Markdown } from "@/components/markdown";
import { NoteAiImportButton } from "@/components/note-ai-import-button";
import { showUndo } from "@/components/undo-toast";
import { readableOn } from "@/lib/utils";
import type { BundleRec } from "@/lib/db";

type Note = Omit<Awaited<ReturnType<typeof getAllNotes>>[number], "topic"> & {
  topic: Awaited<ReturnType<typeof getAllNotes>>[number]["topic"] | null;
};

function NotesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const topicFilter = searchParams.get("topic");
  const [notes, setNotes] = useState<Note[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string; color: string }[]>([]);
  const [bundles, setBundles] = useState<BundleRec[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  // Edit state
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);

  // View / Study state — full reading mode
  const [viewNote, setViewNote] = useState<Note | null>(null);

  useEffect(() => {
    Promise.all([getAllNotes(), getSubjects(), getBundles()]).then(([n, s, b]) => {
      setNotes(n);
      setSubjects(s);
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
        setModalOpen(true);
      }
      if (e.key === "Escape") {
        setModalOpen(false);
        setEditNote(null);
        setViewNote(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filteredNotes = notes.filter((n) => {
    if (topicFilter && n.topicId !== topicFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      (n.content ?? "").toLowerCase().includes(q) ||
      n.tags.some((t) => t.tag.name.toLowerCase().includes(q)) ||
      (n.topic?.name ?? "").toLowerCase().includes(q) ||
      (n.topic?.subject?.name ?? "").toLowerCase().includes(q)
    );
  });
  const activeTopicName = topicFilter
    ? notes.find((n) => n.topicId === topicFilter)?.topic?.name ?? topicFilter.slice(0, 8)
    : null;

  const handleCreate = () => {
    if (!title.trim() || !selectedTopicId) return;
    startTransition(async () => {
      await createNote({
        topicId: selectedTopicId,
        title: title.trim(),
        content: content.trim(),
        tags,
      });
      // Re-fetch so topic include + real tag ids are correct (previous
      // optimistic push used topic: null and fabricated tag ids).
      const fresh = await getAllNotes();
      setNotes(fresh as Note[]);
      setModalOpen(false);
      setTitle("");
      setContent("");
      setTags([]);
      setSelectedTopicId("");
    });
  };

  const handleTogglePin = async (id: string, isPinned: boolean) => {
    await updateNote(id, { isPinned: !isPinned });
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isPinned: !isPinned } : n))
    );
    // keep viewNote in sync if it's the pinned one
    setViewNote((prev) => (prev?.id === id ? { ...prev, isPinned: !isPinned } : prev));
  };

  const handleDelete = (note: Note) => {
    // close view if we delete the note being viewed
    if (viewNote?.id === note.id) setViewNote(null);
    startTransition(async () => {
      await deleteNote(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      showUndo({
        message: `NOTE "${note.title}" DELETED`,
        undo: async () => {
          if (!note.topicId) {
            // Shouldn't happen — notes always have a topic — but guard
            // so undo doesn't throw a zod validation error.
            const fresh = await getAllNotes();
            setNotes(fresh as Note[]);
            return;
          }
          await createNote({
            title: note.title,
            content: note.content || "",
            topicId: note.topicId,
            tags: note.tags.map((t) => t.tag.name),
          });
          const n = await getAllNotes();
          setNotes(n as Note[]);
        },
      });
    });
  };

  const openEdit = (note: Note) => {
    setEditNote(note);
    setEditTitle(note.title);
    setEditContent(note.content || "");
    setEditTags(note.tags.map((t) => t.tag.name));
  };

  const handleEditSave = async () => {
    if (!editNote || !editTitle.trim()) return;
    await updateNote(editNote.id, { title: editTitle.trim(), content: editContent.trim(), tags: editTags });
    const fresh = await getAllNotes();
    setNotes(fresh as Note[]);
    // keep view in sync
    if (viewNote?.id === editNote.id) {
      const updated = (fresh as Note[]).find((n) => n.id === editNote.id);
      if (updated) setViewNote(updated);
    }
    setEditNote(null);
  };

  return (
    <div className="p-8 lg:p-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <RevealHeading text="NOTES" className="text-5xl lg:text-8xl" />
            <ScrambleSubtitle
              text="YOUR STUDY NOTES AND REFERENCE MATERIAL"
              className="mt-4 text-sm text-muted-fg uppercase tracking-widest"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              NEW NOTE
            </Button>
          </div>
        </div>
        {/* Search */}
        {loaded && notes.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="relative max-w-md flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
              <input
                placeholder="SEARCH NOTES..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full border-2 border-border bg-bg pl-10 pr-3 text-sm font-bold uppercase tracking-tight text-fg placeholder:text-muted focus:outline-none"
              />
            </div>
            {topicFilter && (
              <span className="inline-flex items-center gap-2 border-2 border-accent bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-accent-fg">
                <BookOpen size={12} /> {activeTopicName}
                <button onClick={() => router.push("/notes")} className="ml-1 hover:opacity-70" title="Clear topic filter">
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="grid gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-2 border-border bg-bg p-6">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-16 w-full mt-4" />
              <Skeleton className="h-3 w-1/3 mt-4" />
            </div>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<StickyNote size={48} />}
          title="NO NOTES YET"
          description="CREATE NOTES LINKED TO YOUR STUDY TOPICS."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              CREATE NOTE
            </Button>
          }
        />
      ) : filteredNotes.length === 0 ? (
        <EmptyState
          icon={<Search size={48} />}
          title="NO RESULTS"
          description="TRY A DIFFERENT SEARCH."
        />
      ) : (
        <div className="grid gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
          {filteredNotes.map((note) => (
            <Card
              key={note.id}
              hover
              className="group relative flex cursor-pointer flex-col"
              onClick={() => setViewNote(note)}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold uppercase tracking-tight">
                    {note.title}
                  </h3>
                  {note.topic && (
                    <p className="mt-1 text-xs text-muted-fg uppercase tracking-widest">
                      {note.topic.subject?.name && (
                        <span
                          className="mr-1 inline-block px-1.5 py-0.5 text-[10px] font-bold"
                          style={{
                            backgroundColor: note.topic.subject.color,
                            color: readableOn(note.topic.subject.color),
                          }}
                        >
                          {note.topic.subject.name}
                        </span>
                      )}
                      {note.topic.subject?.name && " › "}
                      {note.topic.name}
                    </p>
                  )}
                </div>
                <div
                  className="flex shrink-0 gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setViewNote(note)}
                    className="p-2.5 text-muted hover:text-accent transition-colors"
                    title="Study / view note"
                    aria-label="Study note"
                  >
                    <Eye size={14} />
                  </button>
                  <NoteAiImportButton
                    noteId={note.id}
                    noteTitle={note.title}
                    availableBundles={bundles}
                  />
                  <button
                    onClick={() => openEdit(note)}
                    className="p-2.5 text-muted hover:text-accent transition-colors"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleTogglePin(note.id, note.isPinned)}
                    className={`p-2.5 transition-colors ${
                      note.isPinned ? "text-accent" : "text-muted hover:text-fg"
                    }`}
                    title={note.isPinned ? "Unpin" : "Pin"}
                  >
                    <Pin size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(note)}
                    className="p-2.5 text-muted hover:text-danger transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 text-sm text-muted-fg line-clamp-6">
                {note.content ? <Markdown content={note.content} /> : "NO CONTENT"}
              </div>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-accent opacity-0 transition-opacity group-hover:opacity-100">
                CLICK TO STUDY →
              </p>
              {note.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {note.tags.map(({ tag }) => (
                    <span
                      key={tag.id}
                      className="bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg"
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="NEW NOTE">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">
              TOPIC
            </label>
            <SubjectTopicSelect
              subjects={subjects}
              value={selectedTopicId}
              onChange={setSelectedTopicId}
            />
            {!selectedTopicId && subjects.length > 0 && (
              <p className="text-[11px] uppercase tracking-widest text-warning">
                Pick a subject above and click USE to link a topic before creating.
              </p>
            )}
          </div>
          <Input
            label="TITLE"
            placeholder="NOTE TITLE"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            label="CONTENT"
            placeholder="WRITE YOUR NOTES... (Markdown supported)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
          />
          <TagInput label="TAGS" tags={tags} onChange={setTags} />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              CANCEL
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isPending || !title.trim() || !selectedTopicId}
            >
              {isPending ? "CREATING..." : "CREATE"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editNote} onClose={() => setEditNote(null)} title="EDIT NOTE">
        {editNote && (
          <div className="space-y-6">
            <Input
              label="TITLE"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <Textarea
              label="CONTENT"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={8}
            />
            <TagInput label="TAGS" tags={editTags} onChange={setEditTags} />
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="ghost" onClick={() => setEditNote(null)}>
                CANCEL
              </Button>
              <Button onClick={handleEditSave} disabled={!editTitle.trim()}>
                SAVE
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* View / Study Modal — full reading experience */}
      <Modal open={!!viewNote} onClose={() => setViewNote(null)} title={viewNote ? viewNote.title.toUpperCase() : "NOTE"}>
        {viewNote && (
          <div className="space-y-6">
            {viewNote.topic && (
              <p className="text-xs text-muted-fg uppercase tracking-widest">
                {viewNote.topic.subject?.name && (
                  <span
                    className="mr-1 inline-block px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: viewNote.topic.subject.color,
                      color: readableOn(viewNote.topic.subject.color),
                    }}
                  >
                    {viewNote.topic.subject.name}
                  </span>
                )}
                {viewNote.topic.subject?.name && " › "}
                {viewNote.topic.name}
                {viewNote.isPinned && <span className="ml-2 inline-flex items-center gap-1 text-accent"><Pin size={10} /> PINNED</span>}
              </p>
            )}
            <div className="max-h-[55vh] overflow-y-auto rounded-2xl border-2 border-border bg-muted/10 p-6 text-sm leading-relaxed">
              {viewNote.content ? (
                <Markdown content={viewNote.content} className="prose prose-invert max-w-none" />
              ) : (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <StickyNote size={20} />
                  </div>
                  <p className="text-sm font-bold uppercase tracking-widest">NO CONTENT YET</p>
                  <p className="mt-1 text-xs text-muted-fg">Edit this note to add study material</p>
                  <Button
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      const n = viewNote;
                      setViewNote(null);
                      setTimeout(() => openEdit(n), 150);
                    }}
                  >
                    <Pencil size={14} /> EDIT NOTE
                  </Button>
                </div>
              )}
            </div>
            {viewNote.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {viewNote.tags.map(({ tag }) => (
                  <span
                    key={tag.id}
                    className="bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => setViewNote(null)}>
                CLOSE
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const n = viewNote;
                  setViewNote(null);
                  setTimeout(() => openEdit(n), 150);
                }}
              >
                <Pencil size={14} /> EDIT
              </Button>
              <div onClick={(e) => e.stopPropagation()}>
                <NoteAiImportButton
                  noteId={viewNote.id}
                  noteTitle={viewNote.title}
                  availableBundles={bundles}
                />
              </div>
            </div>
            <p className="text-center text-[10px] uppercase tracking-widest text-muted-fg">
              <BookOpen size={10} className="mr-1 inline" /> STUDY MODE — READ, THEN IMPORT TO FLASHCARDS WITH AI IMPORT
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function NotesPageSuspenseFallback() {
  return (
    <div className="p-8 lg:p-12">
      <Skeleton className="h-12 w-48" />
      <Skeleton className="h-64 w-full mt-8" />
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={<NotesPageSuspenseFallback />}>
      <NotesContent />
    </Suspense>
  );
}
