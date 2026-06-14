export type UserRole = 'admin' | 'member';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: UserRole;
  joined_at: string;
  profiles?: Profile;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null;
  assignee_id: string | null;
  creator_id: string;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  assignee?: Profile;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: Profile;
}

export interface ActivityLog {
  id: string;
  project_id: string;
  task_id: string | null;
  user_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  profiles?: Profile;
}

export const TASK_STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];

export const TASK_PRIORITIES: { key: TaskPriority; label: string; color: string; bg: string }[] = [
  { key: 'low', label: 'Low', color: 'text-slate-400', bg: 'bg-slate-500/10' },
  { key: 'medium', label: 'Medium', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { key: 'high', label: 'High', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { key: 'critical', label: 'Critical', color: 'text-red-500', bg: 'bg-red-500/10' },
];

export const PROJECT_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
];

export function statusColor(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    todo: 'bg-slate-500/10 text-slate-400',
    in_progress: 'bg-blue-500/10 text-blue-400',
    review: 'bg-amber-500/10 text-amber-400',
    done: 'bg-emerald-500/10 text-emerald-400',
  };
  return map[status];
}

export function statusDot(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    todo: 'bg-slate-400',
    in_progress: 'bg-blue-400',
    review: 'bg-amber-400',
    done: 'bg-emerald-400',
  };
  return map[status];
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function isOverdue(task: Task): boolean {
  return task.status !== 'done' && task.deadline !== null && new Date(task.deadline) < new Date();
}

export function isAtRisk(task: Task): boolean {
  if (task.status === 'done') return false;
  const days = daysUntil(task.deadline);
  return (days !== null && days <= 3 && days >= 0) || isOverdue(task);
}
