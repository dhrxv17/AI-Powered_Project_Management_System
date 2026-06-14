import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../lib/toast';
import type { Project, Task } from '../types/database';
import { PROJECT_COLORS, isOverdue, isAtRisk } from '../types/database';
import {
  Plus, FolderKanban, Search, X, Trash2, MoreHorizontal,
  CheckCircle2, Clock, AlertTriangle, Edit3,
} from 'lucide-react';

interface ProjectWithStats extends Project {
  taskCount: number;
  doneCount: number;
  overdueCount: number;
  atRiskCount: number;
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectWithStats | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState(PROJECT_COLORS[0]);

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    const [projRes, taskRes] = await Promise.all([
      supabase.from('projects').select('*').order('updated_at', { ascending: false }),
      supabase.from('tasks').select('id, project_id, status, priority, deadline'),
    ]);
    const allProjects = projRes.data || [];
    const allTasks = (taskRes.data || []) as Pick<Task, 'id' | 'project_id' | 'status' | 'priority' | 'deadline'>[];

    const withStats: ProjectWithStats[] = allProjects.map((p) => {
      const pTasks = allTasks.filter((t) => t.project_id === p.id);
      return {
        ...p,
        taskCount: pTasks.length,
        doneCount: pTasks.filter((t) => t.status === 'done').length,
        overdueCount: pTasks.filter((t) => isOverdue(t as Task)).length,
        atRiskCount: pTasks.filter((t) => isAtRisk(t as Task)).length,
      };
    });
    setProjects(withStats);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const createProject = async () => {
    if (!newName.trim()) return;
    const { data } = await supabase
      .from('projects')
      .insert({ name: newName.trim(), description: newDesc.trim() || null, color: newColor })
      .select().maybeSingle();
    if (data) {
      setProjects([{ ...data, taskCount: 0, doneCount: 0, overdueCount: 0, atRiskCount: 0 }, ...projects]);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setNewColor(PROJECT_COLORS[0]);
      toast.addToast('Project created successfully');
    }
  };

  const deleteProject = async (id: string) => {
    await supabase.from('projects').delete().eq('id', id);
    setProjects(projects.filter((p) => p.id !== id));
    setMenuOpen(null);
    toast.addToast('Project deleted');
  };

  const startEdit = (p: ProjectWithStats) => {
    setEditingProject(p);
    setEditName(p.name);
    setEditDesc(p.description || '');
    setEditColor(p.color);
    setMenuOpen(null);
  };

  const saveEdit = async () => {
    if (!editingProject || !editName.trim()) return;
    const { data } = await supabase
      .from('projects')
      .update({ name: editName.trim(), description: editDesc.trim() || null, color: editColor })
      .eq('id', editingProject.id)
      .select().maybeSingle();
    if (data) {
      setProjects(projects.map((p) =>
        p.id === editingProject.id ? { ...p, name: data.name, description: data.description, color: data.color } : p
      ));
      setEditingProject(null);
      toast.addToast('Project updated');
    }
  };

  const filtered = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-slate-400 text-sm mt-1">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-400 text-white text-sm font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-500 transition shadow-lg shadow-blue-500/20"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input type="text" placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm" />
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">New Project</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-1.5 block">Name</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Website Redesign" autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && createProject()}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm" />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1.5 block">Description</label>
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What's this project about?" rows={3}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm resize-none" />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1.5 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_COLORS.map((c) => (
                    <button key={c} onClick={() => setNewColor(c)}
                      className={`w-8 h-8 rounded-lg transition ${newColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={createProject} disabled={!newName.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-500 transition disabled:opacity-50 text-sm">
                  Create Project
                </button>
                <button onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 bg-white/5 text-slate-400 font-medium rounded-xl hover:bg-white/10 transition text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">Edit Project</h3>
              <button onClick={() => setEditingProject(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-1.5 block">Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm" />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1.5 block">Description</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm resize-none" />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1.5 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_COLORS.map((c) => (
                    <button key={c} onClick={() => setEditColor(c)}
                      className={`w-8 h-8 rounded-lg transition ${editColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={saveEdit} disabled={!editName.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-500 transition disabled:opacity-50 text-sm">
                  Save Changes
                </button>
                <button onClick={() => setEditingProject(null)}
                  className="px-4 py-2.5 bg-white/5 text-slate-400 font-medium rounded-xl hover:bg-white/10 transition text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <FolderKanban className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-400">{search ? 'No projects found' : 'No projects yet'}</h3>
          <p className="text-sm text-slate-500 mt-1">{search ? 'Try a different search' : 'Create your first project to get started'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const progress = project.taskCount > 0 ? Math.round((project.doneCount / project.taskCount) * 100) : 0;
            return (
              <div key={project.id}
                className="group bg-white/5 border border-white/5 rounded-2xl p-5 hover:bg-white/[0.07] hover:border-white/10 transition-all cursor-pointer"
                onClick={() => navigate(`/projects/${project.id}`)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                    <h3 className="font-semibold text-white group-hover:text-blue-400 transition truncate">{project.name}</h3>
                  </div>
                  <div className="relative flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === project.id ? null : project.id); }}
                      className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/10 transition">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuOpen === project.id && (
                      <div className="absolute right-0 top-8 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden z-10 min-w-[140px]">
                        <button onClick={(e) => { e.stopPropagation(); startEdit(project); }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition">
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 transition">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {project.description && <p className="text-sm text-slate-400 line-clamp-2 mb-4">{project.description}</p>}

                {/* Progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-500">{project.doneCount}/{project.taskCount} tasks</span>
                    <span className="text-xs text-slate-500">{progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: project.color }} />
                  </div>
                </div>

                {/* Status indicators */}
                <div className="flex items-center gap-3 text-xs">
                  {project.overdueCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-400">
                      <AlertTriangle className="w-3 h-3" />{project.overdueCount} overdue
                    </span>
                  )}
                  {project.atRiskCount > 0 && project.overdueCount === 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <Clock className="w-3 h-3" />{project.atRiskCount} at risk
                    </span>
                  )}
                  {project.overdueCount === 0 && project.atRiskCount === 0 && project.taskCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />On track
                    </span>
                  )}
                  {project.taskCount === 0 && (
                    <span className="text-slate-500">No tasks yet</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
