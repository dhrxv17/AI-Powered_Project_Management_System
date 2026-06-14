import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Task, Project, ActivityLog } from '../types/database';
import { TASK_PRIORITIES, statusColor, daysUntil, isOverdue, isAtRisk } from '../types/database';
import {
  FolderKanban, CheckCircle2, Clock, AlertTriangle,
  TrendingUp, ArrowRight, Sparkles, Flame,
} from 'lucide-react';

interface ProjectStats {
  project: Project;
  totalTasks: number;
  doneTasks: number;
  overdueTasks: number;
  atRiskTasks: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectStats[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [atRiskTasks, setAtRiskTasks] = useState<Task[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [projRes, taskRes, activityRes] = await Promise.all([
        supabase.from('projects').select('*').order('updated_at', { ascending: false }).limit(10),
        supabase.from('tasks')
          .select('*, assignee:profiles!tasks_assignee_id_fkey(*)')
          .neq('status', 'done')
          .order('deadline', { ascending: true, nullsFirst: false }),
        supabase.from('activity_log')
          .select('*, profiles(*)')
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      const allProjects = projRes.data || [];
      const allTasks = (taskRes.data || []) as unknown as Task[];
      const activities = (activityRes.data || []) as unknown as ActivityLog[];

      const stats: ProjectStats[] = allProjects.map((p) => {
        const pTasks = allTasks.filter((t) => t.project_id === p.id);
        return {
          project: p,
          totalTasks: pTasks.length,
          doneTasks: 0,
          overdueTasks: pTasks.filter(isOverdue).length,
          atRiskTasks: pTasks.filter(isAtRisk).length,
        };
      });
      setProjects(stats);
      setOverdueTasks(allTasks.filter(isOverdue));
      setAtRiskTasks(allTasks.filter(isAtRisk));
      setMyTasks(allTasks.filter((t) => t.assignee_id === user.id));
      setRecentActivity(activities);
      setLoading(false);
    };
    fetch();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  const totalOverdue = overdueTasks.length;
  const totalAtRisk = atRiskTasks.length;
  const totalMyTasks = myTasks.length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Your project overview and AI insights</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <FolderKanban className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm text-slate-400">Projects</span>
          </div>
          <p className="text-3xl font-bold text-white">{projects.length}</p>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-sm text-slate-400">My Tasks</span>
          </div>
          <p className="text-3xl font-bold text-white">{totalMyTasks}</p>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-sm text-slate-400">At Risk</span>
          </div>
          <p className="text-3xl font-bold text-white">{totalAtRisk}</p>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Flame className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-sm text-slate-400">Overdue</span>
          </div>
          <p className="text-3xl font-bold text-white">{totalOverdue}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Briefing */}
        <div className="lg:col-span-2">
          <div className="bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 border border-violet-500/20 rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-semibold text-white">AI Briefing</h2>
            </div>
            {totalOverdue > 0 || totalAtRisk > 0 ? (
              <div className="space-y-3">
                {totalOverdue > 0 && (
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-slate-300">
                      <span className="text-red-400 font-semibold">{totalOverdue} task{totalOverdue !== 1 ? 's' : ''}</span> overdue and need immediate attention.
                      {overdueTasks.slice(0, 3).map((t) => (
                        <span key={t.id} className="text-slate-400"> &ldquo;{t.title}&rdquo;</span>
                      ))}
                    </p>
                  </div>
                )}
                {totalAtRisk > 0 && totalAtRisk > totalOverdue && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-slate-300">
                      <span className="text-amber-400 font-semibold">{totalAtRisk - totalOverdue} task{totalAtRisk - totalOverdue !== 1 ? 's' : ''}</span> at risk of missing their deadline within 3 days.
                    </p>
                  </div>
                )}
                <Link to="/ai" className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition mt-2">
                  Get detailed AI recommendations <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-slate-300">All tasks are on track. No deadlines are at risk. Keep up the great work!</p>
              </div>
            )}
          </div>

          {/* Overdue / At-Risk Tasks */}
          {(totalOverdue > 0 || totalAtRisk > 0) && (
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Urgent Tasks
              </h2>
              <div className="space-y-2">
                {overdueTasks.slice(0, 5).map((task) => {
                  const p = TASK_PRIORITIES.find((pr) => pr.key === task.priority);
                  return (
                    <Link
                      key={task.id}
                      to={`/projects/${task.project_id}`}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-white/5 transition group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                        <p className="text-sm text-white truncate group-hover:text-blue-400 transition">{task.title}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs ${p?.color}`}><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${p?.bg}`}>{p?.label}</span></span>
                        <span className="text-xs text-red-400">
                          {daysUntil(task.deadline) === null ? '' : `${Math.abs(daysUntil(task.deadline)!)}d overdue`}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* My Tasks */}
          {totalMyTasks > 0 && (
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" /> My Active Tasks
              </h2>
              <div className="space-y-2">
                {myTasks.slice(0, 6).map((task) => {
                  const d = daysUntil(task.deadline);
                  return (
                    <Link
                      key={task.id}
                      to={`/projects/${task.project_id}`}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-white/5 transition group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(task.status)}`}>
                          {task.status.replace('_', ' ')}
                        </span>
                        <p className="text-sm text-white truncate group-hover:text-blue-400 transition">{task.title}</p>
                      </div>
                      {d !== null && (
                        <span className={`text-xs flex-shrink-0 ${d < 0 ? 'text-red-400' : d <= 3 ? 'text-amber-400' : 'text-slate-500'}`}>
                          {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'Due today' : `${d}d left`}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Recent Projects */}
          <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Recent Projects</h2>
            <div className="space-y-2">
              {projects.slice(0, 5).map((ps) => (
                <Link
                  key={ps.project.id}
                  to={`/projects/${ps.project.id}`}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-white/5 transition group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ps.project.color }} />
                    <p className="text-sm text-white truncate group-hover:text-blue-400 transition">{ps.project.name}</p>
                  </div>
                  {ps.overdueTasks > 0 && (
                    <span className="text-xs text-red-400 flex-shrink-0">{ps.overdueTasks} overdue</span>
                  )}
                </Link>
              ))}
              {projects.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">No projects yet</p>
              )}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Recent Activity</h2>
            <div className="space-y-3">
              {recentActivity.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5">
                    {(a.profiles?.display_name || a.profiles?.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      <span className="text-white font-medium">{a.profiles?.display_name || 'User'}</span>{' '}
                      {a.action}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {new Date(a.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">No activity yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
