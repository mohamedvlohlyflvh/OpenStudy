"use client";

import { useState, useEffect, useTransition } from "react";
import { Plus, Trash2, Pin, StickyNote, Pencil } from "lucide-react";
import { Card, Button, Modal, Input, EmptyState, Skeleton, Textarea } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { getAllNotes, getSubjects, createNote, deleteNote, updateNote, exportNotesMarkdown } from "@/app/actions";
import { SubjectTopicSelect } from "@/components/subject-topic-select";
import { TagInput } from "@/components/tag-input";
import NotebookLMExportButton from "@/components/notebooklm-export-button";
import { Markdown } from "@/components/markdown";
import { showUndo } from "@/components/undo-toast";
import { readableOn } from "@/lib/utils";

type Note = Omit<Awaited<ReturnType<typeof getAllNotes>>[number], "topic"> & {
  topic: Awaited<ReturnType<typeof getAllNotes>>[number]["topic"] | null;
};

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  // Edit state
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([getAllNotes(), getSubjects()]).then(([n, s]) => {
      setNotes(n);
      setSubjects(s);
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
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCreate = () => {
    if (!title.trim() || !selectedTopicId) return;
    startTransition(async () => {
      const note = await createNote({
        topicId: selectedTopicId,
        title: title.trim(),
        content: content.trim(),
        tags,
      });
      setNotes((prev) => [{ ...note, topic: null, tags: note.tags ?? [] } as Note, ...prev]);
      setModalOpen(false);
      setTitle("");
      setContent("");
      setTags([]);
    });
  };

  const handleTogglePin = async (id: string, isPinned: boolean) => {
    await updateNote(id, { isPinned: !isPinned });
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isPinned: !isPinned } : n))
    );
  };

  const handleDelete = (note: Note) => {
    startTransition(async () => {
      await deleteNote(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      showUndo({
        message: `NOTE "${note.title}" DELETED`,
        undo: async () => {
          // Re-create the note (best-effort restore)
          await createNote({
            title: note.title,
            content: note.content || "",
            topicId: note.topicId ?? undefined,
            tags: note.tags.map((t) => t.tag.name),
          });
          const [n] = await Promise.all([getAllNotes()]);
          setNotes(n);
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
    setNotes((prev) =>
      prev.map((n) =>
        n.id === editNote.id
          ? {
              ...n,
              title: editTitle.trim(),
              content: editContent.trim(),
              tags: editTags.map((name) => ({ tag: { id: name, name } })) as Note["tags"],
            }
          : n
      )
    );
    setEditNote(null);
  };

  return (
    <div className="p-8 lg:p-12">
      {/* Header */}
      <div className="mb-16">
        <div className="flex items-end justify-between">
          <div>
            <RevealHeading text="NOTES" className="text-5xl lg:text-8xl" />
            <p className="mt-4 text-sm text-muted-fg uppercase tracking-widest">
              YOUR STUDY NOTES AND REFERENCE MATERIAL
            </p>
          </div>
          <div className="flex items-center gap-3">
            <NotebookLMExportButton
              notes={notes.map((n) => ({ title: n.title, content: n.content || "" }))}
            />
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              NEW NOTE
            </Button>
          </div>
        </div>
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
      ) : (
        <div className="grid gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <Card key={note.id} hover className="group relative flex flex-col">
              <div className="mb-4 flex items-start justify-between">
                <div>
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
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(note)}
                    className="p-1 text-muted hover:text-accent transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleTogglePin(note.id, note.isPinned)}
                    className={`p-1 transition-colors ${
                      note.isPinned ? "text-accent" : "text-muted hover:text-fg"
                    }`}
                  >
                    <Pin size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(note)}
                    className="p-1 text-muted hover:text-danger transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 text-sm text-muted-fg line-clamp-6">
                {note.content ? <Markdown content={note.content} /> : "NO CONTENT"}
              </div>
              {note.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1">
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
          </div>
          <Input
            label="TITLE"
            placeholder="NOTE TITLE"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            label="CONTENT"
            placeholder="WRITE YOUR NOTES..."
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
    </div>
  );
}
