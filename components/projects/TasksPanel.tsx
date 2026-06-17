"use client";

import { useState, useEffect } from "react";

type OrgUser = { id: string; name: string; email: string };
type Task = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  assignedTo: { id: string; name: string; email: string } | null;
  createdBy: { id: string; name: string };
};

type Props = {
  projectId: string;
  orgUsers: OrgUser[];
  currentUserId: string;
  isAdmin: boolean;
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

function dueBadge(dueDate: string | null): { label: string; cls: string } | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);
  if (diffMs < 0) return { label: "Overdue", cls: "bg-red-100 text-red-700" };
  if (diffDays === 0) return { label: "Due today", cls: "bg-red-100 text-red-700" };
  if (diffDays <= 7) return { label: `Due in ${diffDays}d`, cls: "bg-amber-100 text-amber-700" };
  return { label: d.toLocaleDateString([], { month: "short", day: "numeric" }), cls: "bg-gray-100 text-gray-500" };
}

export function TasksPanel({ projectId, orgUsers, currentUserId, isAdmin }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  // New task form
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/tasks?limit=100`)
      .then(r => { if (!r.ok) throw new Error("fetch failed"); return r.json(); })
      .then(d => { setTasks(d.data ?? []); setTotal(d.pagination?.total ?? 0); })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function createTask() {
    if (!newTitle.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        assignedToId: newAssignee || null,
        dueDate: newDueDate ? new Date(newDueDate).toISOString() : null,
      }),
    });
    if (res.ok) {
      const t = await res.json();
      setTasks(prev => [t, ...prev]);
      setTotal(x => x + 1);
      setCreating(false);
      setNewTitle(""); setNewDesc(""); setNewAssignee(""); setNewDueDate("");
    }
    setSaving(false);
  }

  async function toggleComplete(task: Task) {
    const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: !task.isCompleted }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks(prev => {
        const next = prev.map(t => t.id === task.id ? updated : t);
        return [...next.filter(t => !t.isCompleted), ...next.filter(t => t.isCompleted)];
      });
    }
  }

  async function deleteTask(id: string) {
    await fetch(`/api/projects/${projectId}/tasks/${id}`, { method: "DELETE" });
    setTasks(prev => prev.filter(t => t.id !== id));
    setTotal(x => x - 1);
  }

  async function saveEdit() {
    if (!editTask || !editTask.title.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/tasks/${editTask.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTask.title,
        description: editTask.description,
        assignedToId: editTask.assignedTo?.id ?? null,
        dueDate: editTask.dueDate,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      setEditTask(null);
    }
    setSaving(false);
  }

  const active = tasks.filter(t => !t.isCompleted);
  const done = tasks.filter(t => t.isCompleted);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Tasks ({total})</h3>
        <button
          onClick={() => setCreating(c => !c)}
          aria-label="Create task"
          className="w-6 h-6 rounded-full bg-blue-600 text-white text-lg flex items-center justify-center hover:bg-blue-700 leading-none"
        >
          +
        </button>
      </div>

      {/* Create task form */}
      {creating && (
        <div className="mb-4 border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
          <label htmlFor="new-task-title" className="sr-only">Task title</label>
          <input id="new-task-title" autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Task title *"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <label htmlFor="new-task-desc" className="sr-only">Description</label>
          <textarea id="new-task-desc" rows={2} value={newDesc} onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="new-task-assignee" className="sr-only">Assignee</label>
              <select id="new-task-assignee" value={newAssignee} onChange={e => setNewAssignee(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Unassigned</option>
                {orgUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="new-task-due" className="sr-only">Due date</label>
              <input id="new-task-due" type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createTask} disabled={saving || !newTitle.trim()}
              className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Creating…" : "Create Task"}
            </button>
            <button onClick={() => setCreating(false)}
              className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {fetchError && (
        <div role="alert" className="text-xs text-red-600 text-center py-4">
          Could not load tasks.{" "}
          <button
            onClick={() => {
              setFetchError(false);
              setLoading(true);
              fetch(`/api/projects/${projectId}/tasks?limit=100`)
                .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                .then(d => { setTasks(d.data ?? []); setTotal(d.pagination?.total ?? 0); })
                .catch(() => setFetchError(true))
                .finally(() => setLoading(false));
            }}
            className="underline hover:no-underline"
          >Try again</button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4" aria-label="Loading tasks">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" aria-hidden />
          <p className="text-xs text-gray-600">Loading…</p>
        </div>
      )}

      {!loading && !fetchError && tasks.length === 0 && (
        <div className="text-center py-8">
          <div className="text-3xl mb-2" aria-hidden>✅</div>
          <p className="text-xs text-gray-600">No tasks yet.</p>
          <button onClick={() => setCreating(true)} className="text-xs text-blue-600 hover:underline mt-1">
            Create a Task
          </button>
        </div>
      )}

      {/* Active tasks */}
      <div className="space-y-2">
        {active.map(task => <TaskRow key={task.id} task={task} orgUsers={orgUsers} isAdmin={isAdmin}
          currentUserId={currentUserId} onToggle={() => toggleComplete(task)}
          onDelete={() => deleteTask(task.id)} onEdit={() => setEditTask(task)} />)}
      </div>

      {/* Completed tasks */}
      {done.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-600 font-medium mb-2">Completed ({done.length})</p>
          <div className="space-y-1 opacity-60">
            {done.map(task => <TaskRow key={task.id} task={task} orgUsers={orgUsers} isAdmin={isAdmin}
              currentUserId={currentUserId} onToggle={() => toggleComplete(task)}
              onDelete={() => deleteTask(task.id)} onEdit={() => setEditTask(task)} />)}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTask && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-task-title"
          onKeyDown={e => { if (e.key === "Escape") setEditTask(null); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h4 id="edit-task-title" className="font-semibold text-gray-900">Edit Task</h4>
            <div>
              <label htmlFor="edit-task-title-input" className="sr-only">Task title</label>
              <input
                id="edit-task-title-input"
                autoFocus
                value={editTask.title}
                onChange={e => setEditTask(t => t ? { ...t, title: e.target.value } : t)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="edit-task-desc" className="sr-only">Task description</label>
              <textarea id="edit-task-desc" rows={3} value={editTask.description ?? ""}
                onChange={e => setEditTask(t => t ? { ...t, description: e.target.value } : t)}
                placeholder="Description…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-task-assignee" className="block text-xs text-gray-700 mb-1">Assignee</label>
                <select
                  id="edit-task-assignee"
                  value={editTask.assignedTo?.id ?? ""}
                  onChange={e => setEditTask(t => t ? {
                    ...t,
                    assignedTo: e.target.value ? orgUsers.find(u => u.id === e.target.value) ?? null : null
                  } : t)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {orgUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="edit-task-due" className="block text-xs text-gray-700 mb-1">Due Date</label>
                <input
                  id="edit-task-due"
                  type="date"
                  value={editTask.dueDate ? new Date(editTask.dueDate).toISOString().slice(0, 10) : ""}
                  onChange={e => setEditTask(t => t ? { ...t, dueDate: e.target.value ? new Date(e.target.value).toISOString() : null } : t)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button onClick={() => setEditTask(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task, isAdmin, currentUserId,
  onToggle, onDelete, onEdit,
}: {
  task: Task; orgUsers: OrgUser[]; isAdmin: boolean; currentUserId: string;
  onToggle: () => void; onDelete: () => void; onEdit: () => void;
}) {
  const badge = dueBadge(task.dueDate);
  const canDelete = task.createdBy.id === currentUserId || isAdmin;

  return (
    <div className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition ${
      task.isCompleted ? "border-gray-100 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300"
    }`}>
      <button
        onClick={onToggle}
        aria-label={task.isCompleted ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
        className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
          task.isCompleted ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-blue-400"
        }`}>
        {task.isCompleted && <span className="text-[10px] font-bold" aria-hidden>✓</span>}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${task.isCompleted ? "line-through text-gray-600" : "text-gray-800"}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {task.assignedTo && (
            <span className="text-[10px] text-gray-500">
              → {task.assignedTo.name}
            </span>
          )}
          {badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onEdit} aria-label={`Edit task "${task.title}"`} className="text-gray-600 hover:text-gray-600 text-xs px-1">✏️</button>
        {canDelete && (
          <button
            onClick={() => { if (window.confirm(`Delete task "${task.title}"?`)) onDelete(); }}
            aria-label={`Delete task "${task.title}"`}
            className="text-gray-600 hover:text-red-500 text-xs px-1"
          >🗑</button>
        )}
      </div>
    </div>
  );
}
