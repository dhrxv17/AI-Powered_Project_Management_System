import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../lib/toast';
import type { Task, Project } from '../types/database';
import { TASK_PRIORITIES, statusColor } from '../types/database';
import {
  Sparkles, Loader2, Lightbulb, AlertTriangle,
  CheckCircle2, ArrowUpCircle, FolderKanban, Flag, Clock,
  Zap, Target, ArrowRight, AlertOctagon,
} from 'lucide-react';

interface AIRecommendation {
  task_id: string;
  task_title: string;
  current_priority: string;
  suggested_priority: string;
  suggested_status: string | null;
  reason: string;
  action_type: 'priority' | 'status' | 'deadline' | 'flag';
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

interface DeadlineAlert {
  task_id: string;
  task_title: string;
  alert: string;
}

interface AIResponse {
  recommendations: AIRecommendation[];
  summary: string;
  deadline_alerts: DeadlineAlert[];
  suggestions: string[];
}

export default function AIAssistantPage() {
  useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [projectName, setProjectName] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [summary, setSummary] = useState('');
  const [deadlineAlerts, setDeadlineAlerts] = useState<DeadlineAlert[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchProjects = async () => {
      const { data } = await supabase.from('projects').select('*').order('name');
      if (data) setProjects(data);
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    const fetchTasks = async () => {
      if (!selectedProject) { setTasks([]); return; }
      const proj = projects.find((p) => p.id === selectedProject);
      setProjectName(proj?.name || '');
      const { data } = await supabase
        .from('tasks')
        .select('*, assignee:profiles!tasks_assignee_id_fkey(*)')
        .eq('project_id', selectedProject)
        .neq('status', 'done')
        .order('deadline', { nullsFirst: true });
      if (data) setTasks(data as unknown as Task[]);
    };
    fetchTasks();
  }, [selectedProject, projects]);

  const getRecommendations = async () => {
    if (!selectedProject || tasks.length === 0) return;
    setLoading(true);
    setError(null);
    setRecommendations([]);
    setSummary('');
    setDeadlineAlerts([]);
    setSuggestions([]);
    setAppliedIds(new Set());

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ tasks, project_name: projectName }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Request failed (${response.status})`);
      }

      const data: AIResponse = await response.json();
      if (!data.recommendations || !Array.isArray(data.recommendations)) {
        throw new Error('Invalid response format from AI');
      }
      setRecommendations(data.recommendations);
      setSummary(data.summary || '');
      setDeadlineAlerts(data.deadline_alerts || []);
      setSuggestions(data.suggestions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get recommendations');
    } finally {
      setLoading(false);
    }
  };

  const applyRecommendation = async (rec: AIRecommendation) => {
    const updates: Record<string, unknown> = { priority: rec.suggested_priority };
    if (rec.suggested_status) updates.status = rec.suggested_status;
    const { error: updateError } = await supabase.from('tasks').update(updates).eq('id', rec.task_id);
    if (updateError) { toast.addToast('Failed to apply', 'error'); return; }
    setAppliedIds(new Set([...appliedIds, rec.task_id]));
    setTasks(tasks.map((t) => {
      if (t.id !== rec.task_id) return t;
      return { ...t, priority: rec.suggested_priority as Task['priority'], status: (rec.suggested_status || t.status) as Task['status'] };
    }));
    toast.addToast(`Applied: ${rec.task_title}`);
  };

  const priorityColor = (p: string) => TASK_PRIORITIES.find((pr) => pr.key === p)?.color ?? 'text-slate-400';
  const priorityBg = (p: string) => TASK_PRIORITIES.find((pr) => pr.key === p)?.bg ?? 'bg-slate-500/10';

  const urgencyBadge = (urgency: string) => {
    const styles: Record<string, string> = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/30',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      low: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    };
    return styles[urgency] || styles.low;
  };

  const actionIcon = (type: string) => {
    switch (type) {
      case 'priority': return <ArrowUpCircle className="w-3.5 h-3.5" />;
      case 'status': return <Target className="w-3.5 h-3.5" />;
      case 'deadline': return <Clock className="w-3.5 h-3.5" />;
      default: return <Flag className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-400 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">AI Assistant</h1>
        </div>
        <p className="text-slate-400 text-sm mt-1">Smart task management, deadline tracking, and priority optimization</p>
      </div>

      {/* Project Selector */}
      <div className="bg-white/5 border border-white/5 rounded-2xl p-5 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-sm text-slate-400 mb-1.5 block">Select Project</label>
            <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition text-sm">
              <option value="" className="bg-slate-800">Choose a project...</option>
              {projects.map((p) => <option key={p.id} value={p.id} className="bg-slate-800">{p.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={getRecommendations} disabled={!selectedProject || tasks.length === 0 || loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-400 text-white text-sm font-semibold rounded-xl hover:from-violet-600 hover:to-fuchsia-500 transition shadow-lg shadow-violet-500/20 disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Analyze Tasks
            </button>
          </div>
        </div>
        {selectedProject && tasks.length > 0 && (
          <p className="text-xs text-slate-500 mt-3">{tasks.length} active task{tasks.length !== 1 ? 's' : ''} will be analyzed</p>
        )}
        {selectedProject && tasks.length === 0 && (
          <p className="text-xs text-amber-400 mt-3">No active tasks. Add some tasks to this project first.</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div><p className="text-sm font-medium text-red-400">Analysis Failed</p><p className="text-sm text-red-400/70 mt-1">{error}</p></div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-5 py-4 mb-6 flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-violet-300">{summary}</p>
        </div>
      )}

      {/* Deadline Alerts */}
      {deadlineAlerts.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <AlertOctagon className="w-4 h-4" /> Deadline Alerts
          </h2>
          <div className="space-y-2">
            {deadlineAlerts.map((alert) => (
              <div key={alert.task_id} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-white font-medium">{alert.task_title}</p>
                  <p className="text-xs text-red-400/80">{alert.alert}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4" /> Actionable Suggestions
          </h2>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-xs text-blue-400 font-bold mt-0.5">{i + 1}.</span>
                <p className="text-sm text-blue-300">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white mb-4">Task Recommendations</h2>
          {recommendations.map((rec) => {
            const applied = appliedIds.has(rec.task_id);
            const isPriorityChange = rec.current_priority !== rec.suggested_priority;
            const isStatusChange = rec.suggested_status !== null && rec.suggested_status !== undefined;
            const hasAction = isPriorityChange || isStatusChange;
            return (
              <div key={rec.task_id}
                className={`bg-white/5 border rounded-2xl p-5 transition ${applied ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-medium text-white">{rec.task_title}</h4>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${urgencyBadge(rec.urgency)}`}>
                        {actionIcon(rec.action_type)}
                        {rec.urgency}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      {isPriorityChange && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          Priority: <span className={`px-1.5 py-0.5 rounded ${priorityBg(rec.current_priority)} ${priorityColor(rec.current_priority)}`}>{rec.current_priority}</span>
                          <ArrowRight className="w-3 h-3 text-slate-600" />
                          <span className={`px-1.5 py-0.5 rounded ${priorityBg(rec.suggested_priority)} ${priorityColor(rec.suggested_priority)}`}>{rec.suggested_priority}</span>
                        </span>
                      )}
                      {isStatusChange && rec.suggested_status && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          Status: <span className={`px-1.5 py-0.5 rounded-full ${statusColor(rec.suggested_status as Task['status'])}`}>{rec.suggested_status.replace('_', ' ')}</span>
                        </span>
                      )}
                      {!isPriorityChange && !isStatusChange && (
                        <span className="text-xs text-slate-500">No changes suggested</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{rec.reason}</p>
                  </div>
                  <div className="flex-shrink-0">
                    {applied ? (
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs"><CheckCircle2 className="w-4 h-4" />Applied</div>
                    ) : hasAction ? (
                      <button onClick={() => applyRecommendation(rec)}
                        className="px-3 py-1.5 bg-violet-500/10 text-violet-400 text-xs font-medium rounded-lg hover:bg-violet-500/20 transition flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Apply
                      </button>
                    ) : (
                      <span className="text-xs text-slate-600">OK</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!selectedProject && !loading && (
        <div className="text-center py-20">
          <FolderKanban className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-400">Select a project</h3>
          <p className="text-sm text-slate-500 mt-1">Choose a project for AI-powered task management</p>
        </div>
      )}
    </div>
  );
}
