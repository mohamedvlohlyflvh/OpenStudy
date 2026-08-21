"use client";

import { useState, useEffect, useTransition } from "react";
import { Plus, Trash2, BookOpen, Pencil } from "lucide-react";
import { Card, Button, Modal, Input, EmptyState, Skeleton } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { getSubjects, createSubject, deleteSubject, createTopic, getTopics, updateTopic, deleteTopic, updateSubject } from "@/app/actions";
import { BundleColorPicker } from "@/components/bundle-color-picker";
import { readableOn } from "@/lib/utils";

type Subject = Awaited<ReturnType<typeof getSubjects>>[number];

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#DFE104");
  const [isPending, startTransition] = useTransition();

  // Subject edit state
  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState("#FACC15");

  // Topic management modal state
  const [manageTopicsFor, setManageTopicsFor] = useState<string | null>(null);
  const [manageSubjectsName, setManageSubjectsName] = useState("");
  const [managedTopics, setManagedTopics] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [topicLoaded, setTopicLoaded] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [editTopicId, setEditTopicId] = useState<string | null>(null);
  const [editTopicName, setEditTopicName] = useState("");
  const [deleteTopicId, setDeleteTopicId] = useState<string | null>(null);

  const openManageTopics = async (subjectId: string, subjectName: string) => {
    setManageTopicsFor(subjectId);
    setManageSubjectsName(subjectName);
    setTopicLoaded(false);
    setNewTopicName("");
    setEditTopicId(null);
    const t = await getTopics(subjectId);
    setManagedTopics(t.map((x) => ({ id: x.id, name: x.name, description: x.description ?? null })));
    setTopicLoaded(true);
  };

  const handleAddTopic = () => {
    const t = newTopicName.trim();
    if (!t || !manageTopicsFor) return;
    startTransition(async () => {
      await createTopic({ subjectId: manageTopicsFor, name: t });
      const t2 = await getTopics(manageTopicsFor);
      setManagedTopics(t2.map((x) => ({ id: x.id, name: x.name, description: x.description ?? null })));
      setNewTopicName("");
      setTopicCounts((prev) => ({
        ...prev,
        [manageTopicsFor]: (prev[manageTopicsFor] ?? 0) + 1,
      }));
    });
  };

  const handleRenameTopic = (id: string) => {
    const t = editTopicName.trim();
    if (!t) return;
    startTransition(async () => {
      await updateTopic(id, { name: t });
      setManagedTopics((prev) => prev.map((x) => (x.id === id ? { ...x, name: t } : x)));
      setEditTopicId(null);
      setEditTopicName("");
    });
  };

  const handleDeleteTopic = (id: string) => {
    if (!manageTopicsFor) return;
    startTransition(async () => {
      await deleteTopic(id);
      const t2 = await getTopics(manageTopicsFor);
      setManagedTopics(t2.map((x) => ({ id: x.id, name: x.name, description: x.description ?? null })));
      setTopicCounts((prev) => ({
        ...prev,
        [manageTopicsFor]: Math.max(0, (prev[manageTopicsFor] ?? 1) - 1),
      }));
      setDeleteTopicId(null);
    });
  };

  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    getSubjects().then((s) => {
      setSubjects(s);
      setTopicCounts(
        Object.fromEntries(s.map((x) => [x.id, x._count.topics]))
      );
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
        setEditSubject(null);
        setManageTopicsFor(null);
        setDeleteTopicId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCreate = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      const subject = await createSubject({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        icon: "book-open",
      });
      setSubjects((prev) => [{ ...subject, _count: { topics: 0, flashcards: 0, studySessions: 0 } }, ...prev]);
      setModalOpen(false);
      setName("");
      setDescription("");
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("DELETE THIS SUBJECT AND ALL ITS DATA?")) return;
    startTransition(async () => {
      await deleteSubject(id);
      setSubjects((prev) => prev.filter((s) => s.id !== id));
    });
  };

  const openEditSubject = (subject: Subject) => {
    setEditSubject(subject);
    setEditName(subject.name);
    setEditDescription(subject.description ?? "");
    setEditColor(subject.color || "#FACC15");
  };

  const handleEditSave = () => {
    if (!editSubject || !editName.trim()) return;
    startTransition(async () => {
      const desc = editDescription.trim();
      await updateSubject(editSubject.id, { name: editName.trim(), description: desc, color: editColor });
      setSubjects((prev) =>
        prev.map((s) =>
          s.id === editSubject.id
            ? { ...s, name: editName.trim(), description: desc || null, color: editColor }
            : s
        )
      );
      setEditSubject(null);
    });
  };

  return (
    <div className="p-8 lg:p-12">
      {/* Header */}
      <div className="mb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <RevealHeading text="SUBJECTS" className="text-5xl lg:text-8xl" />
            <p className="mt-4 text-sm text-muted-fg uppercase tracking-widest">
              ORGANIZE YOUR LEARNING TOPICS
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            NEW SUBJECT
          </Button>
        </div>
      </div>

      {!loaded ? (
        <div className="grid gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-2 border-border bg-bg p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex gap-6">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={48} />}
          title="NO SUBJECTS YET"
          description="CREATE YOUR FIRST SUBJECT TO START ORGANIZING YOUR STUDIES."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              CREATE SUBJECT
            </Button>
          }
        />
      ) : (
        <div className="grid gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject) => (
            <Card
              key={subject.id}
              hover
              className="group relative"
            >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center text-2xl font-bold uppercase transition-colors duration-200 bg-[var(--chip)] text-[var(--chip-text)] group-hover:bg-black group-hover:text-[#DFE104] hover:bg-black hover:text-[#DFE104]"
                      style={{
                        ["--chip" as string]: subject.color || "#DFE104",
                        ["--chip-text" as string]: readableOn(subject.color || "#DFE104"),
                      }}
                    >
                      {subject.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-xl font-bold uppercase tracking-tight">
                        {subject.name}
                      </h3>
                      {subject.description && (
                        <p className="mt-1 text-xs text-muted-fg uppercase tracking-widest line-clamp-1">
                          {subject.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditSubject(subject);
                      }}
                      aria-label="Edit subject"
                      className="p-2 text-muted-fg border border-border transition-all hover:border-accent hover:bg-accent hover:text-accent-fg"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(subject.id);
                      }}
                      aria-label="Delete subject"
                      className="p-2 text-muted-fg border border-border transition-all hover:border-danger hover:bg-danger hover:text-on-color"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              <div className="mt-6 flex gap-6 text-xs font-bold uppercase tracking-widest text-muted-fg">
                <span>{topicCounts[subject.id] ?? subject._count.topics} TOPICS</span>
                <span>{subject._count.flashcards} CARDS</span>
                <span>{subject._count.studySessions} SESSIONS</span>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openManageTopics(subject.id, subject.name);
                }}
                className="mt-4 inline-flex items-center py-2 text-xs font-bold uppercase tracking-widest text-accent transition-colors hover:underline"
              >
                MANAGE TOPICS
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Topic Management Modal */}
      <Modal
        open={!!manageTopicsFor}
        onClose={() => setManageTopicsFor(null)}
        title={`TOPICS · ${manageSubjectsName.toUpperCase()}`}
      >
        <div className="space-y-4">
          {/* Add */}
          <div className="flex gap-2">
            <Input
              placeholder="NEW TOPIC NAME..."
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTopic();
                if (e.key === "Escape") {
                  setNewTopicName("");
                }
              }}
            />
            <Button size="sm" onClick={handleAddTopic} disabled={!newTopicName.trim()}>
              ADD
            </Button>
          </div>

          {/* List */}
          {!topicLoaded ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : managedTopics.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={40} />}
              title="NO TOPICS YET"
              description="ADD YOUR FIRST TOPIC ABOVE."
            />
          ) : (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {managedTopics.map((topic) => (
                <div
                  key={topic.id}
                  className="flex items-center justify-between gap-3 border-2 border-border bg-bg p-3"
                >
                  {editTopicId === topic.id ? (
                    <Input
                      autoFocus
                      value={editTopicName}
                      onChange={(e) => setEditTopicName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameTopic(topic.id);
                        if (e.key === "Escape") {
                          setEditTopicId(null);
                          setEditTopicName("");
                        }
                      }}
                    />
                  ) : (
                    <span className="flex-1 truncate text-sm font-bold uppercase tracking-tight">
                      {topic.name}
                    </span>
                  )}
                  <div className="flex shrink-0 gap-1">
                    {editTopicId === topic.id ? (
                      <Button size="sm" onClick={() => handleRenameTopic(topic.id)}>
                        SAVE
                      </Button>
                    ) : (
                      <button
                        onClick={() => {
                          setEditTopicId(topic.id);
                          setEditTopicName(topic.name);
                        }}
                        aria-label="Edit topic"
                        className="p-2 text-muted-fg transition-colors hover:bg-accent hover:text-accent-fg"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTopicId(topic.id)}
                      aria-label="Delete topic"
                      className="p-2 text-muted-fg transition-colors hover:bg-danger hover:text-on-color"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Topic Confirmation */}
      <Modal
        open={!!deleteTopicId}
        onClose={() => setDeleteTopicId(null)}
        title="DELETE TOPIC"
      >
        {deleteTopicId && (
          <div className="space-y-6">
            <p className="text-sm text-muted-fg">
              DELETE THIS TOPIC? ITS FLASHCARDS AND NOTES WILL BE MOVED TO NO TOPIC OR REMOVED. THIS CANNOT BE UNDONE.
            </p>
            <div className="flex justify-end gap-4 pt-2">
              <Button variant="ghost" onClick={() => setDeleteTopicId(null)}>
                CANCEL
              </Button>
              <Button variant="danger" onClick={() => handleDeleteTopic(deleteTopicId)}>
                DELETE
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="NEW SUBJECT">
        <div className="space-y-6">
          <Input
            label="SUBJECT NAME"
            placeholder="E.G. LINEAR ALGEBRA"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="DESCRIPTION (OPTIONAL)"
            placeholder="BRIEF DESCRIPTION..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <BundleColorPicker value={color} onChange={setColor} />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              CANCEL
            </Button>
            <Button onClick={handleCreate} disabled={isPending || !name.trim()}>
              {isPending ? "CREATING..." : "CREATE"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Subject Modal */}
      <Modal open={!!editSubject} onClose={() => setEditSubject(null)} title="EDIT SUBJECT">
        {editSubject && (
          <div className="space-y-6">
            <Input
              label="SUBJECT NAME"
              placeholder="E.G. LINEAR ALGEBRA"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <Input
              label="DESCRIPTION (OPTIONAL)"
              placeholder="BRIEF DESCRIPTION..."
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
            <BundleColorPicker value={editColor} onChange={setEditColor} />
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="ghost" onClick={() => setEditSubject(null)}>
                CANCEL
              </Button>
              <Button onClick={handleEditSave} disabled={isPending || !editName.trim()}>
                {isPending ? "SAVING..." : "SAVE"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
