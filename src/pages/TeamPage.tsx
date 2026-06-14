import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Profile, UserRole } from '../types/database';
import { Users, Shield, UserCircle, Search } from 'lucide-react';

export default function TeamPage() {
  const { user, isRole } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
      if (data) setProfiles(data);
      setLoading(false);
    };
    fetchProfiles();
  }, []);

  const updateRole = async (id: string, role: UserRole) => {
    if (!isRole('admin') || id === user?.id) return;
    const { data } = await supabase.from('profiles').update({ role }).eq('id', id).select().maybeSingle();
    if (data) setProfiles(profiles.map((p) => (p.id === id ? data : p)));
  };

  const filtered = profiles.filter(
    (p) => p.display_name?.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Team</h1>
        <p className="text-slate-400 text-sm mt-1">{profiles.length} member{profiles.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input type="text" placeholder="Search members..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition text-sm" />
      </div>

      <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Member</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Role</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-white/[0.02] transition">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {(p.display_name || p.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {p.display_name || 'Unnamed'}
                        {p.id === user?.id && <span className="text-slate-500 ml-2 text-xs">(you)</span>}
                      </p>
                      <p className="text-xs text-slate-500">{p.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  {isRole('admin') && p.id !== user?.id ? (
                    <select value={p.role} onChange={(e) => updateRole(p.id, e.target.value as UserRole)}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer">
                      <option value="admin" className="bg-slate-800">Admin</option>
                      <option value="member" className="bg-slate-800">Member</option>
                    </select>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                      p.role === 'admin' ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-500/10 text-slate-400'
                    }`}>
                      {p.role === 'admin' ? <Shield className="w-3 h-3" /> : <UserCircle className="w-3 h-3" />}
                      {p.role === 'admin' ? 'Admin' : 'Member'}
                    </span>
                  )}
                </td>
                <td className="px-5 py-4 text-sm text-slate-500">{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No members found</p>
          </div>
        )}
      </div>
    </div>
  );
}
