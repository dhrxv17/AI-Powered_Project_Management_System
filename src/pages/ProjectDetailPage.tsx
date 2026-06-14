import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../lib/toast';
import type { Task, TaskStatus, TaskPriority, Project, ProjectMember, Profile, TaskComment, ActivityLog } from '../types/database';
import { TASK_STATUSES, TASK_PRIORITIES, statusColor, statusDot, daysUntil, isOverdue, isAtRisk } from '../types/database';
import {
  Plus, X, Calendar, Flag, ArrowLeft, Trash2, Settings, List, LayoutGrid,
  MessageSquare, Send, AlertTriangle, Clock,
} from 'lucide-react';

function DroppableColumn({ status, tasks, onAddTask, children }: {
  status: { key: TaskStatus; label: string };
  tasks: Task[];
  onAddTask: (status: TaskStatus) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: status.key });
  return (
    <div className="flex-shrink-0 w-[280px] lg:w-auto">
      <div ref={setNodeRef} className="bg-white/[0.03] border border-white/5 rounded-2xl p-3 min-h-[300px]">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${statusDot(status.key)}`} />
            <h3 className="text-sm font-semibold text-white">{status.label}</h3>
            <span className="text-xs text-slate-500 bg-white/5 rounded-full px-2 py-0.5">{tasks.length}</span>
          </div>
          <button onClick={() => onAddTask(status.key)} className="p-1 text-slate-500 hover:text-blue-400 hover:bg-white/5 rounded-lg transition">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const priorityInfo = TASK_PRIORITIES.find((p) => p.key === task.priority);
  const overdue = isOverdue(task);
  const atRisk = isAtRisk(task);
  const days = daysUntil(task.deadline);

  return (
    <div onClick={onClick}
      className={`group rounded-xl p-3.5 cursor-grab active:cursor-grabbing hover:bg-white/[0.07] transition-all border ${
        overdue ? 'bg-red-500/5 border-red-500/20' :
        atRisk ? 'bg-amber-500/5 border-amber-500/20' :
        'bg-white/5 border-white/5 hover:border-white/10'
      }`}>
      <p className="text-sm font-medium text-white mb-2 line-clamp-2">{task.title}</p>
      {overdue && (
        <div className="flex items-center gap-1 text-[10px] text-red-400 mb-1.5">
          <AlertTriangle className="w-3 h-3" />
          {days !== null ? `${Math.abs(days)}d overdue` : 'Overdue'}
        </div>
      )}
      {!overdue && atRisk && days !== null && days >= 0 && (
        <div className="flex items-center gap-1 text-[10px] text-amber-400 mb-1.5">
          <Clock className="w-3 h-3" />{days === 0 ? 'Due today' : `${days}d left`}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 text-xs ${priorityInfo?.color}`}>
          <Flag className="w-3 h-3" />{priorityInfo?.label}
        </span>
        {task.deadline && !overdue && !atRisk && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Calendar className="w-3 h-3" />
            {new Date(task.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
        {task.assignee && (
          <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-[8px] text-white font-bold ml-auto">
            {(task.assignee.display_name || task.assignee.email)[0].toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onClick={onClick} />
    </div>
  );
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user, isRole } = useAuth();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<(ProjectMember & { profiles: Profile })[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [selectedTaskForComments, setSelectedTaskForComments] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Quick add
  const [quickAddText, setQuickAddText] = useState('');

  // Task form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('todo');

  // Comment form
  const [newComment, setNewComment] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const logActivity = useCallback(async (action: string, taskId: string | null, details: Record<string, unknown> = {}) => {
    if (!projectId || !user) return;
    await supabase.from('activity_log').insert({
      project_id: projectId,
      task_id: taskId,
      user_id: user.id,
      action,
      details,
    });
  }, [projectId, user]);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    const [projRes, taskRes, memberRes, profileRes, activityRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
      supabase.from('tasks').select('*, assignee:profiles!tasks_assignee_id_fkey(*)').eq('project_id', projectId).order('created_at', { ascending: true }),
      supabase.from('project_members').select('*, profiles(*)').eq('project_id', projectId),
      supabase.from('profiles').select('*'),
      supabase.from('activity_log').select('*, profiles(*)').eq('project_id', projectId).order('created_at', { ascending: false }).limit(20),
    ]);
    if (projRes.data) setProject(projRes.data);
    if (taskRes.data) setTasks(taskRes.data as unknown as Task[]);
    if (memberRes.data) setMembers(memberRes.data as unknown as (ProjectMember & { profiles: Profile })[]);
    if (profileRes.data) setAllProfiles(profileRes.data);
    if (activityRes.data) setActivity(activityRes.data as unknown as ActivityLog[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  const fetchComments = async (taskId: string) => {
    const { data } = await supabase
      .from('task_comments')
      .select('*, profiles(*)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    if (data) setComments(data as unknown as TaskComment[]);
  };

  const openCreateTask = (status: TaskStatus = 'todo') => {
    setEditingTask(null);
    setTaskTitle('');
    setTaskDesc('');
    setTaskPriority('medium');
    setTaskDeadline('');
    setTaskAssignee('');
    setTaskStatus(status);
    setShowTaskModal(true);
  };

  const openEditTask = (task: Task) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskDesc(task.description || '');
    setTaskPriority(task.priority);
    setTaskDeadline(task.deadline ? task.deadline.slice(0, 16) : '');
    setTaskAssignee(task.assignee_id || '');
    setTaskStatus(task.status);
    setShowTaskModal(true);
  };

  const openComments = (taskId: string) => {
    setSelectedTaskForComments(taskId);
    setShowComments(true);
    fetchComments(taskId);
  };

  const addComment = async () => {
    if (!newComment.trim() || !selectedTaskForComments || !user) return;
    const { data } = await supabase
      .from('task_comments')
      .insert({ task_id: selectedTaskForComments, user_id: user.id, content: newComment.trim() })
      .select('*, profiles(*)')
      .maybeSingle();
    if (data) {
      setComments([...comments, data as unknown as TaskComment]);
      await logActivity('commented on task', selectedTaskForComments, { comment: newComment.trim() });
      setNewComment('');
    }
  };

  const quickAddTask = async () => {
    if (!quickAddText.trim() || !projectId || !user) return;
    const { data } = await supabase
      .from('tasks')
      .insert({ title: quickAddText.trim(), project_id: projectId, status: 'todo', priority: 'medium' })
      .select('*, assignee:profiles!tasks_assignee_id_fkey(*)')
      .maybeSingle();
    if (data) {
      setTasks([...tasks, data as unknown as Task]);
      await logActivity('created task', data.id, { title: quickAddText.trim() });
      setQuickAddText('');
      toast.addToast(`Task added: ${data.title}`);
    }
  };

  const saveTask = async () => {
    if (!taskTitle.trim() || !projectId) return;
    const payload = {
      title: taskTitle.trim(),
      description: taskDesc.trim() || null,
      priority: taskPriority,
      deadline: taskDeadline ? new Date(taskDeadline).toISOString() : null,
      assignee_id: taskAssignee || null,
      status: taskStatus,
      project_id: projectId,
    };

    if (editingTask) {
      const { data } = await supabase.from('tasks').update(payload).eq('id', editingTask.id)
        .select('*, assignee:profiles!tasks_assignee_id_fkey(*)').maybeSingle();
      if (data) {
        setTasks(tasks.map((t) => (t.id === editingTask.id ? (data as unknown as Task) : t)));
        // Log changes
        const changes: string[] = [];
        if (editingTask.status !== taskStatus) changes.push(`status: ${editingTask.status} -> ${taskStatus}`);
        if (editingTask.priority !== taskPriority) changes.push(`priority: ${editingTask.priority} -> ${taskPriority}`);
        if (editingTask.title !== taskTitle.trim()) changes.push('renamed');
        await logActivity('updated task', editingTask.id, { changes });
        toast.addToast('Task updated');
      }
    } else {
      const { data } = await supabase.from('tasks').insert(payload)
        .select('*, assignee:profiles!tasks_assignee_id_fkey(*)').maybeSingle();
      if (data) {
        setTasks([...tasks, data as unknown as Task]);
        await logActivity('created task', data.id, { title: taskTitle.trim() });
        toast.addToast(`Task created: ${data.title}`);
      }
    }
    setShowTaskModal(false);
  };

  const deleteTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    await supabase.from('tasks').delete().eq('id', id);
    setTasks(tasks.filter((t) => t.id !== id));
    if (task) await logActivity('deleted task', id, { title: task.title });
    setShowTaskModal(false);
    toast.addToast('Task deleted');
  };

  const moveTask = async (taskId: string, newStatus: TaskStatus) => {
    const oldTask = tasks.find((t) => t.id === taskId);
    const { data } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
      .select('*, assignee:profiles!tasks_assignee_id_fkey(*)').maybeSingle();
    if (data) {
      setTasks(tasks.map((t) => (t.id === taskId ? (data as unknown as Task) : t)));
      if (oldTask && oldTask.status !== newStatus) {
        await logActivity('moved task', taskId, { from: oldTask.status, to: newStatus });
        toast.addToast(`${data.title} moved to ${newStatus.replace('_', ' ')}`);
      }
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const t = tasks.find((t) => t.id === event.active.id);
    if (t) setActiveTask(t);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id as string;
    const overId = over.id as string;
    const targetStatus = TASK_STATUSES.find((s) => s.key === overId);
    if (targetStatus) { moveTask(taskId, targetStatus.key); return; }
    const overTask = tasks.find((t) => t.id === overId);
    if (overTask) moveTask(taskId, overTask.status);
  };

  const assignMembers = async (userId: string) => {
    if (!projectId) return;
    const { data } = await supabase.from('project_members').insert({ project_id: projectId, user_id: userId })
      .select('*, profiles(*)').maybeSingle();
    if (data) {
      setMembers([...members, data as unknown as (ProjectMember & { profiles: Profile })]);
      await logActivity('added member', null, { user_id: userId });
      toast.addToast('Member added');
    }
  };

  const removeMember = async (memberId: string, userId: string) => {
    await supabase.from('project_members').delete().eq('id', memberId);
    setMembers(members.filter((m) => m.id !== memberId));
    await logActivity('removed member', null, { user_id: userId });
    toast.addToast('Member removed');
  };

  const nonMembers = allProfiles.filter(
    (p) => !members.some((m) => m.user_id === p.id) && p.id !== project?.owner_id
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Project not found</p>
        <button onClick={() => navigate('/projects')} className="text-blue-400 mt-2 text-sm hover:underline">Back to projects</button>
      </div>
    );
  }

  const overdueTasks = tasks.filter(isOverdue);
  const atRiskTasks = tasks.filter((t) => isAtRisk(t) && !isOverdue(t));
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  const statusGroups = TASK_STATUSES.map((status) => ({
    ...status,
    tasks: tasks.filter((t) => t.status === status.key),
  }));

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => navigate('/projects')} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition mb-3">
          <ArrowLeft className="w-4 h-4" /> Projects
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: project.color }} />
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-white/5 rounded-lg p-0.5">
              <button onClick={() => setViewMode('kanban')}
                className={`p-2 rounded-md transition ${viewMode === 'kanban' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
            <button onClick={() => openCreateTask('todo')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-400 text-white text-sm font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-500 transition shadow-lg shadow-blue-500/20">
              <Plus className="w-4 h-4" /> Add Task
            </button>
          </div>
        </div>
        {project.description && <p className="text-slate-400 text-sm mt-2">{project.description}</p>}
      </div>

      {/* Overdue / At-Risk Alerts */}
      {(overdueTasks.length > 0 || atRiskTasks.length > 0) && (
        <div className="mb-6 flex gap-3 flex-wrap">
          {overdueTasks.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-red-400 font-medium">{overdueTasks.length} overdue</span>
            </div>
          )}
          {atRiskTasks.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 font-medium">{atRiskTasks.length} at risk</span>
            </div>
          )}
        </div>
      )}

      {/* Progress + Members bar */}
      <div className="mb-6 flex items-center gap-6 flex-wrap">
        {/* Progress */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500">Progress</span>
            <span className="text-xs text-slate-400 font-medium">{doneCount}/{tasks.length} done ({progress}%)</span>
          </div>
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: project.color }} />
          </div>
        </div>

        {/* Members */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Team</span>
          <div className="flex items-center -space-x-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-[10px] font-bold border-2 border-slate-950" title="Owner">O</div>
            {members.map((m) => (
              <div key={m.id} className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center text-white text-[10px] font-bold border-2 border-slate-950"
                title={m.profiles?.display_name || m.profiles?.email}>
                {(m.profiles?.display_name || m.profiles?.email || '?')[0].toUpperCase()}
              </div>
            ))}
          </div>
          {isRole('admin') && nonMembers.length > 0 && (
            <div className="relative group">
              <button className="p-1 text-slate-500 hover:text-blue-400 rounded-lg hover:bg-white/5 transition"><Settings className="w-4 h-4" /></button>
              <div className="absolute right-0 top-8 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-10 w-64 max-h-60 overflow-auto opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all p-2">
                <p className="text-xs text-slate-400 px-2 py-1.5">Add member</p>
                {nonMembers.map((p) => (
                  <button key={p.id} onClick={() => assignMembers(p.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-white hover:bg-white/5 rounded-lg transition">
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-[9px] text-white font-bold">
                      {(p.display_name || p.email)[0].toUpperCase()}
                    </div>
                    <span className="truncate">{p.display_name || p.email}</span>
                  </button>
                ))}
                {members.length > 0 && (
                  <>
                    <p className="text-xs text-slate-400 px-2 py-1.5 mt-2">Remove member</p>
                    {members.map((m) => (
                      <button key={m.id} onClick={() => removeMember(m.id, m.user_id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-red-400 hover:bg-white/5 rounded-lg transition">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center text-[9px] text-white font-bold">
                          {(m.profiles?.display_name || m.profiles?.email || '?')[0].toUpperCase()}
                        </div>
                        <span className="truncate">{m.profiles?.display_name || m.profiles?.email}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Add */}
      <div className="mb-6 flex gap-2">
        <div className="flex-1 relative">
          <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={quickAddText}
            onChange={(e) => setQuickAddText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAddTask()}
            placeholder="Quick add task... (press Enter)"
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm"
          />
        </div>
      </div>

      {/* Kanban */}
      {viewMode === 'kanban' ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
            {statusGroups.map((group) => (
              <DroppableColumn key={group.key} status={group} tasks={group.tasks} onAddTask={openCreateTask}>
                <SortableContext items={group.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {group.tasks.map((task) => (
                    <SortableTaskCard key={task.id} task={task} onClick={() => openEditTask(task)} />
                  ))}
                </SortableContext>
              </DroppableColumn>
            ))}
          </div>
          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} onClick={() => {}} />}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Task</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Priority</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Deadline</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Assignee</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tasks.map((task) => {
                const p = TASK_PRIORITIES.find((pr) => pr.key === task.priority);
                return (
                  <tr key={task.id} onClick={() => openEditTask(task)} className="hover:bg-white/[0.02] transition cursor-pointer">
                    <td className="px-5 py-3.5 text-sm text-white">
                      <div className="flex items-center gap-2">
                        {isOverdue(task) && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                        {task.title}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${statusColor(task.status)}`}>
                        {TASK_STATUSES.find((s) => s.key === task.status)?.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-xs ${p?.color}`}><Flag className="w-3 h-3" />{p?.label}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-sm ${isOverdue(task) ? 'text-red-400' : 'text-slate-400'}`}>
                        {task.deadline ? new Date(task.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '-'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {task.assignee ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-[9px] text-white font-bold">
                            {(task.assignee.display_name || task.assignee.email)[0].toUpperCase()}
                          </div>
                          <span className="text-sm text-slate-400 truncate">{task.assignee.display_name}</span>
                        </div>
                      ) : <span className="text-sm text-slate-600">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={(e) => { e.stopPropagation(); openComments(task.id); }}
                        className="p-1 text-slate-500 hover:text-blue-400 rounded-lg hover:bg-white/5 transition">
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tasks.length === 0 && (
            <div className="text-center py-12"><p className="text-slate-400 text-sm">No tasks yet. Use the quick-add bar above to create one.</p></div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      {activity.length > 0 && (
        <div className="mt-8 bg-white/5 border border-white/5 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {activity.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5">
                  {(a.profiles?.display_name || a.profiles?.email || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">
                    <span className="text-white font-medium">{a.profiles?.display_name || 'User'}</span>{' '}
                    {a.action}
                  </p>
                  <p className="text-[10px] text-slate-600">{new Date(a.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">{editingTask ? 'Edit Task' : 'New Task'}</h3>
              <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-1.5 block">Title</label>
                <input type="text" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" autoFocus
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm" />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1.5 block">Description</label>
                <textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Optional description" rows={3}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-400 mb-1.5 block">Status</label>
                  <select value={taskStatus} onChange={(e) => setTaskStatus(e.target.value as TaskStatus)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm">
                    {TASK_STATUSES.map((s) => <option key={s.key} value={s.key} className="bg-slate-800">{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-400 mb-1.5 block">Priority</label>
                  <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm">
                    {TASK_PRIORITIES.map((p) => <option key={p.key} value={p.key} className="bg-slate-800">{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-400 mb-1.5 block">Deadline</label>
                  <input type="datetime-local" value={taskDeadline} onChange={(e) => setTaskDeadline(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm [color-scheme:dark]" />
                </div>
                <div>
                  <label className="text-sm text-slate-400 mb-1.5 block">Assignee</label>
                  <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm">
                    <option value="" className="bg-slate-800">Unassigned</option>
                    {allProfiles.map((p) => <option key={p.id} value={p.id} className="bg-slate-800">{p.display_name || p.email}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button onClick={saveTask} disabled={!taskTitle.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-500 transition disabled:opacity-50 text-sm">
                  {editingTask ? 'Save Changes' : 'Create Task'}
                </button>
                {editingTask && (
                  <>
                    <button onClick={() => { openComments(editingTask.id); setShowTaskModal(false); }}
                      className="px-4 py-2.5 bg-white/5 text-slate-400 font-medium rounded-xl hover:bg-white/10 transition text-sm">
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteTask(editingTask.id)}
                      className="px-4 py-2.5 bg-red-500/10 text-red-400 font-medium rounded-xl hover:bg-red-500/20 transition text-sm">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comments Drawer */}
      {showComments && selectedTaskForComments && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-400" /> Comments
              </h3>
              <button onClick={() => { setShowComments(false); setSelectedTaskForComments(null); }} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {comments.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">No comments yet. Start the discussion!</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                    {(c.profiles?.display_name || c.profiles?.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white">{c.profiles?.display_name || 'User'}</span>
                      <span className="text-[10px] text-slate-600">{new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm text-slate-300 mt-0.5">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addComment()}
                placeholder="Add a comment..."
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm"
              />
              <button onClick={addComment} disabled={!newComment.trim()}
                className="px-4 py-2.5 bg-blue-500/10 text-blue-400 rounded-xl hover:bg-blue-500/20 transition disabled:opacity-50">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
