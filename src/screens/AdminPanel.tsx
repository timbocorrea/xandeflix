import React, { useState, useEffect, useCallback } from 'react';
import { Users, Shield, Link as LinkIcon, LogOut, Check, ShieldAlert, Plus, Trash2, X, Edit2, Save, Eye, ChevronDown, ChevronRight, Folder, FolderOpen, Tv, Film, Clapperboard, FileVideo, Square, CheckSquare, Search, Image as ImageIcon, FileText } from 'lucide-react';
import { useStore } from '../store/useStore';

// Wrapper to isolate lucide icons from react-native-web's createElement
const Icon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{children}</span>
);

export const AdminPanel: React.FC<{ onExitAdmin: () => void }> = ({ onExitAdmin }) => {
  const { managedUsers, setManagedUsers } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const authToken = localStorage.getItem('xandeflix_auth_token') || '';
  
  // New User Form State
  const [newUserName, setNewUserName] = useState('');
  const [newUserUrl, setNewUserUrl] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  
  // Modal State for editing
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // Modal State for Preview (Tree view)
  const [previewingUser, setPreviewingUser] = useState<any | null>(null);
  const [previewCategories, setPreviewCategories] = useState<any[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [expandedRoot, setExpandedRoot] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});
  const [mediaOverrides, setMediaOverrides] = useState<Record<string, any>>({});
  const [savingHidden, setSavingHidden] = useState(false);

  // Item Specific Metadata Modal
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isGlobalOverride, setIsGlobalOverride] = useState(false);
  const [tmdbSearchResults, setTmdbSearchResults] = useState<any[]>([]);
  const [tmdbSearching, setTmdbSearching] = useState(false);

  const handlePreviewUser = async (user: any) => {
    setPreviewingUser(user);
    setPreviewCategories(null);
    setExpandedRoot(null);
    setExpandedCategory(null);
    setHiddenCategories(user.hiddenCategories || []);
    setCategoryOverrides(user.categoryOverrides || {});
    setMediaOverrides(user.mediaOverrides || {});
    setPreviewLoading(true);
    try {
      const response = await fetch(`/api/admin/user/${user.id}/categories`, {
        headers: { 'x-admin-token': authToken }
      });
      if (!response.ok) {
        throw new Error('Não foi possível carregar as categorias da lista.');
      }
      const data = await response.json();
      setPreviewCategories(data);
    } catch (err: any) {
      alert(err.message);
      setPreviewingUser(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveHidden = async () => {
    if (!previewingUser) return;
    setSavingHidden(true);
    try {
      const [hiddenRes, overridesRes] = await Promise.all([
        fetch(`/api/admin/user/${previewingUser.id}/hiddenCategories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': authToken },
          body: JSON.stringify({ categories: hiddenCategories })
        }),
        fetch(`/api/admin/user/${previewingUser.id}/categoryOverrides`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': authToken },
          body: JSON.stringify({ overrides: categoryOverrides })
        }),
        fetch(`/api/admin/user/${previewingUser.id}/mediaOverrides`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': authToken },
          body: JSON.stringify({ overrides: mediaOverrides })
        })
      ]);

      if (!hiddenRes.ok || !overridesRes.ok) throw new Error('Não foi possível salvar os filtros remotos.');
      
      const updatedManagedUsers = managedUsers.map(u => 
        u.id === previewingUser.id ? { ...u, hiddenCategories, categoryOverrides, mediaOverrides } : u
      );
      setManagedUsers(updatedManagedUsers);
      alert('Filtros e modificações salvos com sucesso!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingHidden(false);
    }
  };

  const toggleCategoryVisibility = (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenCategories(prev => 
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  };

  const readErrorMessage = useCallback(async (response: Response, fallback: string) => {
    try {
      const data = await response.json();
      return data?.error || data?.message || fallback;
    } catch {
      return fallback;
    }
  }, []);

  const searchTmdb = async (query: string, type: 'movie' | 'series') => {
    if (!query) return;
    setTmdbSearching(true);
    try {
      const resp = await fetch(`/api/tmdb/search?query=${encodeURIComponent(query)}&type=${type}`);
      const data = await resp.json();
      setTmdbSearchResults(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('TMDB Search Error:', e);
    } finally {
      setTmdbSearching(false);
    }
  };

  const applyTmdbMetadata = (meta: any) => {
    if (!editingItem) return;
    const updated = {
      ...editingItem,
      title: meta.title,
      thumbnail: meta.poster_path ? `https://image.tmdb.org/t/p/w500${meta.poster_path}` : editingItem.thumbnail,
      description: meta.overview || editingItem.description,
    };
    setEditingItem(updated);
    
    // Auto save to local mediaOverrides
    setMediaOverrides(prev => ({
      ...prev,
      [editingItem.url]: {
        title: updated.title,
        thumbnail: updated.thumbnail,
        description: updated.description
      }
    }));
    setTmdbSearchResults([]);
  };

  const handleUpdateMediaOverride = (field: string, value: string) => {
    if (!editingItem) return;
    const updated = { ...editingItem, [field]: value };
    setEditingItem(updated);
    setMediaOverrides(prev => ({
      ...prev,
      [editingItem.url]: {
        ...prev[editingItem.url],
        [field]: value
      }
    }));
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/users', {
        headers: { 'x-admin-token': authToken }
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Não foi possível carregar os usuários.'));
      }
      const data = await response.json();
      setManagedUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [setManagedUsers, authToken, readErrorMessage]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    setActionLoading(userId);
    setError(null);
    try {
      const response = await fetch('/api/admin/user/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': authToken },
        body: JSON.stringify({ userId, blocked: !currentStatus })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Não foi possível atualizar o status.'));
      }
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } 
    finally { setActionLoading(null); }
  };

  const handleAddUser = async () => {
    if (!newUserName || !newUserUsername) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/user/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': authToken },
        body: JSON.stringify({ 
          name: newUserName, 
          playlistUrl: newUserUrl,
          username: newUserUsername,
          password: newUserPassword 
        })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Não foi possível criar o usuário.'));
      }
      setNewUserName('');
      setNewUserUrl('');
      setNewUserUsername('');
      setNewUserPassword('');
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } 
    finally { setLoading(false); }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Tem certeza que deseja remover este acesso?')) return;
    setActionLoading(userId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/user/${userId}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': authToken }
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Não foi possível remover o usuário.'));
      }
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } 
    finally { setActionLoading(null); }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setActionLoading(editingUser.id);
    setError(null);
    try {
      const response = await fetch('/api/admin/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': authToken },
        body: JSON.stringify({ 
          userId: editingUser.id, 
          name: editingUser.name,
          username: editingUser.username,
          password: editingUser.password,
          playlistUrl: editingUser.playlistUrl 
        })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Não foi possível salvar as alterações.'));
      }
      setEditingUser(null);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } 
    finally { setActionLoading(null); }
  };

  return (
    <div style={s.container}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.logoContainer}>
          <div style={s.logo}>XANDEFLIX</div>
          <div style={s.adminBadge}>ADMIN</div>
        </div>
        <button onClick={onExitAdmin} style={s.navItem}>
          <Icon><LogOut size={20} color="white" /></Icon>
          <span style={s.navText}>Voltar ao Início</span>
        </button>
      </div>

      {/* Main Content */}
      <div style={s.content}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>Painel de Controle</h1>
            <p style={s.subtitle}>Gerencie os acessos e assinaturas dos usuários.</p>
          </div>
          <div style={s.statCard}>
            <Icon><Users size={24} color="#E50914" /></Icon>
            <div>
              <div style={s.statValue}>{managedUsers.length}</div>
              <div style={s.statLabel}>USUÁRIOS ATIVOS</div>
            </div>
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* New User Card */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <Icon><Plus size={20} color="#E50914" /></Icon>
              <span style={s.cardTitle}>NOVO ACESSO</span>
            </div>
            <div style={s.formGrid}>
              <div style={s.inputGroup}>
                <label style={s.label}>Nome do Cliente</label>
                <input style={s.input} value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Ex: João Silva" />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>ID de Acesso (Username)</label>
                <input style={s.input} value={newUserUsername} onChange={e => setNewUserUsername(e.target.value)} placeholder="Ex: joao.acesso" />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>Senha</label>
                <input style={s.input} type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="••••••" />
              </div>
              <div style={{ ...s.inputGroup, gridColumn: 'span 2' }}>
                <label style={s.label}>URL da Playlist (M3U)</label>
                <input style={s.input} value={newUserUrl} onChange={e => setNewUserUrl(e.target.value)} placeholder="http://..." />
              </div>
              <button onClick={handleAddUser} style={s.addButton}>
                Gerar Acesso
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <Icon><Shield size={20} color="#E50914" /></Icon>
              <span style={s.cardTitle}>GERENCIAR USUÁRIOS</span>
            </div>

            {error && (
              <div style={s.errorBanner}>
                {error}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#E50914' }}>Carregando...</div>
            ) : (
              <div>
                <div style={s.tableHeader}>
                  <span style={{ ...s.columnLabel, flex: 1.5 }}>USUÁRIO / CLIENTE</span>
                  <span style={{ ...s.columnLabel, flex: 2 }}>LISTA M3U</span>
                  <span style={{ ...s.columnLabel, flex: 1 }}>STATUS</span>
                  <span style={{ ...s.columnLabel, flex: 1, textAlign: 'right' as const }}>AÇÕES</span>
                </div>

                {managedUsers.map((user: any) => (
                  <div key={user.id} style={s.tableRow}>
                    <div style={{ flex: 1.5 }}>
                      <div style={s.userName}>{user.name}</div>
                      <div style={s.userId}>ID: {user.username}</div>
                    </div>
                    <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon><LinkIcon size={12} color="rgba(255,255,255,0.4)" /></Icon>
                      <span style={s.userUrl}>{user.playlistUrl || '—'}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{
                        ...s.statusBadge,
                        backgroundColor: user.isBlocked ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                      }}>
                        <span style={{
                          ...s.statusDot,
                          backgroundColor: user.isBlocked ? '#EF4444' : '#22C55E',
                        }} />
                        <span style={{
                          ...s.statusText,
                          color: user.isBlocked ? '#EF4444' : '#22C55E',
                        }}>
                          {user.isBlocked ? 'BLOQUEADO' : 'ATIVO'}
                        </span>
                      </span>
                    </div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        onClick={() => handlePreviewUser(user)}
                        title="Ver Categorias"
                        style={{ ...s.actionBtn, borderColor: 'rgba(255,255,255,0.1)' }}
                      >
                        <Icon><Eye size={16} color="white" /></Icon>
                      </button>
                      <button
                        onClick={() => setEditingUser({ ...user })}
                        style={{ ...s.actionBtn, borderColor: 'rgba(255,255,255,0.1)' }}
                      >
                        <Icon><Edit2 size={16} color="white" /></Icon>
                      </button>
                      <button
                        onClick={() => handleToggleStatus(user.id, user.isBlocked)}
                        style={{
                          ...s.actionBtn,
                          borderColor: user.isBlocked ? '#22C55E' : '#EF4444',
                        }}
                      >
                        <Icon>
                          {user.isBlocked ? <Check size={16} color="#22C55E" /> : <ShieldAlert size={16} color="#EF4444" />}
                        </Icon>
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        style={{ ...s.actionBtn, borderColor: 'rgba(255,255,255,0.1)' }}
                      >
                        <Icon><Trash2 size={16} color="rgba(255,255,255,0.6)" /></Icon>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Editar Usuário</h2>
              <button onClick={() => setEditingUser(null)} style={s.closeBtn}>
                <Icon><X size={24} color="white" /></Icon>
              </button>
            </div>
            <div style={s.modalBody}>
              <div style={s.inputGroup}>
                <label style={s.label}>Nome do Cliente</label>
                <input 
                  style={s.input} 
                  value={editingUser.name} 
                  onChange={e => setEditingUser({...editingUser, name: e.target.value})} 
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>ID de Acesso (Username)</label>
                <input 
                  style={s.input} 
                  value={editingUser.username} 
                  onChange={e => setEditingUser({...editingUser, username: e.target.value})} 
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>Senha</label>
                <input 
                  style={s.input} 
                  type="text"
                  value={editingUser.password || ''} 
                  onChange={e => setEditingUser({...editingUser, password: e.target.value})} 
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>URL da Playlist</label>
                <input 
                  style={s.input} 
                  value={editingUser.playlistUrl} 
                  onChange={e => setEditingUser({...editingUser, playlistUrl: e.target.value})} 
                />
              </div>
            </div>
            <div style={s.modalFooter}>
              <button onClick={() => setEditingUser(null)} style={s.cancelBtn}>Cancelar</button>
              <button onClick={handleUpdateUser} style={s.saveBtn}>
                <Icon><Save size={18} color="white" /></Icon>
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Preview Modal */}
      {previewingUser && (
        <div style={s.modalOverlay}>
          <div style={{...s.modal, width: 1200, maxHeight: '95vh', display: 'flex', flexDirection: 'column'}}>
            <div style={s.modalHeader}>
              <div>
                 <h2 style={s.modalTitle}>Categorias de {previewingUser.name}</h2>
                 {/* <p style={{ color: 'rgba(255,255,255,0.5)', margin: '4px 0 0 0', fontSize: 14 }}>
                   {previewingUser.playlistUrl || 'Nenhuma lista vinculada'}
                 </p> */}
              </div>
              <button 
                onClick={() => {
                   setPreviewingUser(null);
                   setPreviewCategories(null);
                }} 
                style={s.closeBtn}
              >
                <Icon><X size={24} color="white" /></Icon>
              </button>
            </div>
            
            <div style={{ ...s.modalBody, overflowY: 'auto', flex: 1, paddingRight: 10 }}>
              {previewLoading ? (
                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 16 }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>Processando e analisando a lista M3U (isso pode demorar vários segundos)...</span>
                 </div>
              ) : previewCategories && previewCategories.length > 0 ? (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { id: 'live', label: 'TV AO VIVO', icon: <Tv size={18} />, color: '#F87171', bg: 'rgba(239,68,68,0.1)' },
                      { id: 'series', label: 'SÉRIES', icon: <Clapperboard size={18} />, color: '#C084FC', bg: 'rgba(168,85,247,0.1)' },
                      { id: 'movie', label: 'FILMES', icon: <Film size={18} />, color: '#60A5FA', bg: 'rgba(59,130,246,0.1)' }
                       ].map(root => {
                          const rootCategories = previewCategories.filter(c => (categoryOverrides[c.id] || c.type) === root.id);
                          if (rootCategories.length === 0) return null;
                          const isRootExpanded = expandedRoot === root.id;
                          
                          return (
                            <div key={root.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {/* Root Level (Type) */}
                              <div 
                                onClick={() => setExpandedRoot(isRootExpanded ? null : root.id)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 12, padding: 16,
                                  backgroundColor: root.bg, border: `1px solid ${root.color}40`, borderRadius: 8, cursor: 'pointer'
                                }}>
                                <Icon>
                                  {isRootExpanded ? <ChevronDown size={20} color={root.color} /> : <ChevronRight size={20} color={root.color} />}
                                </Icon>
                                <Icon>{root.icon}</Icon>
                                <span style={{ fontWeight: 900, color: root.color, flex: 1, letterSpacing: 1 }}>{root.label}</span>
                                <span style={{ color: root.color, opacity: 0.8, fontSize: 13, fontWeight: 'bold' }}>
                                  {rootCategories.length} pastas
                                </span>
                              </div>

                              {/* Category Level (Folders) */}
                              {isRootExpanded && (
                                <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, marginBottom: 12 }}>
                                  {rootCategories.map((cat: any, idx: number) => {
                                    const isCatExpanded = expandedCategory === cat.id;
                                    return (
                                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <div
                                          onClick={() => setExpandedCategory(isCatExpanded ? null : cat.id)}
                                          style={{
                                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                                            backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, cursor: 'pointer',
                                            opacity: hiddenCategories.includes(cat.id) ? 0.4 : 1
                                          }}>
                                          <div 
                                            onClick={(e) => toggleCategoryVisibility(cat.id, e)}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 4 }}
                                          >
                                            <Icon>
                                              {hiddenCategories.includes(cat.id) ? (
                                                <Square size={20} color="rgba(255,255,255,0.3)" />
                                              ) : (
                                                <CheckSquare size={20} color="#3B82F6" />
                                              )}
                                            </Icon>
                                          </div>
                                          <Icon>
                                            {isCatExpanded ? <ChevronDown size={16} color="white" /> : <ChevronRight size={16} color="white" />}
                                          </Icon>
                                          <Icon>
                                            {isCatExpanded ? <FolderOpen size={18} color="#E5A00D" fill="#E5A00D" fillOpacity={0.2} /> : <Folder size={18} color="#E5A00D" fill="#E5A00D" fillOpacity={0.2} />}
                                          </Icon>
                                          <span style={{ fontWeight: 'bold', color: 'white', flex: 1, textDecoration: hiddenCategories.includes(cat.id) ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.title}</span>
                                          <select
                                            value={categoryOverrides[cat.id] || cat.type}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              setCategoryOverrides(prev => ({ ...prev, [cat.id]: e.target.value }));
                                            }}
                                            style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: 4, fontFamily: 'Outfit', fontSize: 12, cursor: 'pointer', outline: 'none', marginLeft: 8, marginRight: 8 }}
                                          >
                                            <option value="live">TV ao Vivo</option>
                                            <option value="series">Séries</option>
                                            <option value="movie">Filmes</option>
                                          </select>
                                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, minWidth: '60px', textAlign: 'right' }}>{cat.itemCount} itens</span>
                                        </div>

                                     {/* Item Level (Files) */}
                                     {isCatExpanded && cat.items && cat.items.length > 0 && (
                                       <div style={{ paddingLeft: 44, display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 12, paddingTop: 4 }}>
                                         {cat.items.slice(0, 500).map((item: any, itemIdx: number) => {
                                           const override = mediaOverrides[item.url] || {};
                                           const displayTitle = override.title || item.title;
                                           return (
                                             <div 
                                               key={itemIdx} 
                                               onClick={() => {
                                                 setEditingItem({ ...item, ...override });
                                                 setIsGlobalOverride(false);
                                               }}
                                               style={{ 
                                                 display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', 
                                                 opacity: hiddenCategories.includes(cat.id) ? 0.3 : 1,
                                                 cursor: 'pointer', borderRadius: 4, transition: 'background 0.2s'
                                               }}
                                               onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                                               onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                             >
                                               <Icon><FileVideo size={14} color={override.title ? "#3B82F6" : "rgba(255,255,255,0.2)"} /></Icon>
                                               <span style={{ color: override.title ? '#3B82F6' : 'rgba(255,255,255,0.6)', fontSize: 14 }}>{displayTitle}</span>
                                               {override.thumbnail && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#3B82F6' }} title="Modificado pelo Admin" />}
                                             </div>
                                           );
                                         })}
                                         {cat.items.length > 500 && (
                                           <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, paddingLeft: 22, fontStyle: 'italic', marginTop: 4 }}>
                                             + {cat.items.length - 500} arquivos não exibidos para economizar memória
                                           </div>
                                         )}
                                       </div>
                                     )}
                                   </div>
                                 );
                               })}
                             </div>
                           )}
                         </div>
                       );
                    })}
                 </div>
              ) : (
                 <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>
                    Nenhuma categoria encontrada ou lista inválida.
                 </div>
              )}
            </div>
            {/* Modal Footer (Save Filters) */}
            <div style={{ ...s.modalFooter, borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: '#0a0a0a' }}>
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 12 }}>
                 <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                   <strong style={{ color: 'white' }}>{hiddenCategories.length}</strong> categorias ocultadas
                 </span>
              </div>
              <button 
                onClick={handleSaveHidden} 
                disabled={savingHidden}
                style={{ ...s.saveBtn, backgroundColor: savingHidden ? 'rgba(59,130,246,0.5)' : '#3B82F6', cursor: savingHidden ? 'not-allowed' : 'pointer' }}>
                <Icon><Save size={18} color="white" /></Icon>
                {savingHidden ? 'Salvando...' : 'Salvar Filtros'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Media Item Detail / Metadata Editor Modal */}
      {editingItem && (
        <div style={{ ...s.modalOverlay, zIndex: 1100 }}>
          <div style={{ ...s.modal, width: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Editar Metadados</h2>
              <button onClick={() => { setEditingItem(null); setTmdbSearchResults([]); }} style={s.closeBtn}>
                <Icon><X size={24} color="white" /></Icon>
              </button>
            </div>
            
            <div style={{ ...s.modalBody, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', gap: 30 }}>
                {/* Preview / Image Section */}
                <div style={{ width: 260, flexShrink: 0 }}>
                  <label style={s.label}>Capa Atual</label>
                  <div style={{ 
                    width: '100%', aspectRatio: '2/3', backgroundColor: 'rgba(255,255,255,0.05)', 
                    borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)',
                    position: 'relative', marginTop: 10
                  }}>
                    {editingItem.thumbnail ? (
                      <img src={editingItem.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.2)' }}>
                        <ImageIcon size={48} />
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <label style={s.label}>URL da Imagem</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input 
                        style={{ ...s.input, flex: 1, fontSize: 13, height: 38, padding: '0 12px' }} 
                        value={editingItem.thumbnail || ''} 
                        onChange={e => handleUpdateMediaOverride('thumbnail', e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </div>

                {/* Form Section */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={s.inputGroup}>
                    <label style={s.label}>Título do Arquivo</label>
                    <input 
                      style={s.input} 
                      value={editingItem.title} 
                      onChange={e => handleUpdateMediaOverride('title', e.target.value)}
                    />
                  </div>

                  <div style={s.inputGroup}>
                    <label style={s.label}>Descrição / Sinopse</label>
                    <textarea 
                      style={{ ...s.input, minHeight: 120, resize: 'vertical', lineHeight: '1.5' }} 
                      value={editingItem.description || ''} 
                      onChange={e => handleUpdateMediaOverride('description', e.target.value)}
                    />
                  </div>

                  {/* TMDB Integration Section */}
                  <div style={{ 
                    backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 16, padding: 20, 
                    border: '1px solid rgba(255,255,255,0.05)', marginTop: 10 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
                      <Search size={18} color="#00BBFF" />
                      <span style={{ fontWeight: 900, fontSize: 13, color: '#00BBFF', letterSpacing: 0.5 }}>BUSCAR NO TMDB</span>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button 
                        onClick={() => searchTmdb(editingItem.title, 'movie')}
                        disabled={tmdbSearching}
                        style={{ 
                          flex: 1, height: 40, borderRadius: 8, border: '1px solid rgba(0,187,255,0.3)', 
                          backgroundColor: 'rgba(0,187,255,0.1)', color: '#00BBFF', fontWeight: 800, fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        {tmdbSearching ? 'Buscando...' : 'Buscar como Filme'}
                      </button>
                      <button 
                        onClick={() => searchTmdb(editingItem.title, 'series')}
                        disabled={tmdbSearching}
                        style={{ 
                          flex: 1, height: 40, borderRadius: 8, border: '1px solid rgba(168,85,247,0.3)', 
                          backgroundColor: 'rgba(168,85,247,0.1)', color: '#C084FC', fontWeight: 800, fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        {tmdbSearching ? 'Buscando...' : 'Buscar como Série'}
                      </button>
                    </div>

                    {tmdbSearchResults.length > 0 && (
                      <div style={{ 
                        marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', 
                        gap: 12, maxHeight: 250, overflowY: 'auto', paddingRight: 10
                      }}>
                        {tmdbSearchResults.map((res: any) => (
                          <div 
                            key={res.id} 
                            onClick={() => applyTmdbMetadata(res)}
                            style={{ 
                              cursor: 'pointer', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)',
                              transition: 'transform 0.2s, border-color 0.2s', position: 'relative'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.borderColor = '#00BBFF'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                          >
                            <img 
                              src={res.poster_path ? `https://image.tmdb.org/t/p/w185${res.poster_path}` : 'https://via.placeholder.com/130x195?text=Sem+Poster'} 
                              style={{ width: '100%', display: 'block' }} 
                            />
                            <div style={{ 
                              position: 'absolute', bottom: 0, left: 0, right: 0, 
                              background: 'linear-gradient(transparent, black)', padding: '10px 6px',
                              fontSize: 10, color: 'white', fontWeight: 'bold', textAlign: 'center'
                            }}>
                              {res.title || res.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={s.modalFooter}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <div 
                  onClick={() => setIsGlobalOverride(!isGlobalOverride)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 12px', borderRadius: 8, backgroundColor: isGlobalOverride ? 'rgba(59,130,246,0.1)' : 'transparent', border: `1px solid ${isGlobalOverride ? '#3B82F6' : 'rgba(255,255,255,0.1)'}` }}
                >
                  <Icon>{isGlobalOverride ? <CheckSquare size={16} color="#3B82F6" /> : <Square size={16} color="rgba(255,255,255,0.5)" />}</Icon>
                  <span style={{ fontSize: 13, color: isGlobalOverride ? 'white' : 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}>Aplicar Globalmente (Todos os usuários)</span>
                </div>
              </div>
              <button 
                onClick={() => { setEditingItem(null); setTmdbSearchResults([]); }} 
                style={s.cancelBtn}
              >
                Cancelar
              </button>
              <button 
                onClick={async () => { 
                   if (isGlobalOverride && editingItem) {
                     await fetch('/api/admin/globalMediaOverride', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json', 'x-admin-token': authToken },
                       body: JSON.stringify({
                         itemTitle: editingItem.title,
                         override: {
                           title: editingItem.title,
                           thumbnail: editingItem.thumbnail,
                           description: editingItem.description
                         }
                       })
                     });
                   }
                   setEditingItem(null); 
                   setTmdbSearchResults([]); 
                }} 
                style={{ ...s.saveBtn, backgroundColor: '#3B82F6' }}
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Responsive helper — avoids the broken scale(0.8) hack
const isMobileDevice = () => typeof window !== 'undefined' && window.innerWidth < 768;

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: typeof window !== 'undefined' && window.innerWidth < 768 ? 'column' : 'row',
    minHeight: '100vh',
    width: '100%',
    backgroundColor: '#050505',
    fontFamily: 'Outfit, sans-serif',
    overflowX: 'hidden',
  },
  sidebar: {
    width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : 240,
    minWidth: typeof window !== 'undefined' && window.innerWidth < 768 ? 'unset' : 240,
    backgroundColor: '#0a0a0a',
    borderRight: typeof window !== 'undefined' && window.innerWidth >= 768 ? '1px solid rgba(255,255,255,0.05)' : 'none',
    borderBottom: typeof window !== 'undefined' && window.innerWidth < 768 ? '1px solid rgba(255,255,255,0.05)' : 'none',
    padding: typeof window !== 'undefined' && window.innerWidth < 768 ? '16px 20px' : '30px',
    display: 'flex',
    flexDirection: typeof window !== 'undefined' && window.innerWidth < 768 ? 'row' : 'column',
    alignItems: typeof window !== 'undefined' && window.innerWidth < 768 ? 'center' : 'flex-start',
    justifyContent: typeof window !== 'undefined' && window.innerWidth < 768 ? 'space-between' : 'flex-start',
  },
  logoContainer: {
    marginBottom: typeof window !== 'undefined' && window.innerWidth < 768 ? 0 : 40,
  },
  logo: { fontSize: 22, fontWeight: 900, color: '#E50914', fontStyle: 'italic' },
  adminBadge: { color: 'white', fontSize: 9, fontWeight: 900, backgroundColor: '#E50914', display: 'inline-block', padding: '2px 5px', borderRadius: 2, marginTop: -2 },
  navItem: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: 'none', color: 'white', fontSize: 15, fontWeight: 'bold', fontFamily: 'Outfit', transition: 'background 0.2s', minHeight: 44 },
  navText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  content: {
    flex: 1,
    padding: typeof window !== 'undefined' && window.innerWidth < 768 ? '20px 16px' : '40px 48px',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  header: {
    display: 'flex',
    flexDirection: typeof window !== 'undefined' && window.innerWidth < 768 ? 'column' : 'row',
    justifyContent: 'space-between',
    alignItems: typeof window !== 'undefined' && window.innerWidth < 768 ? 'flex-start' : 'center',
    marginBottom: typeof window !== 'undefined' && window.innerWidth < 768 ? 24 : 40,
    gap: 16,
  },
  title: {
    fontSize: typeof window !== 'undefined' && window.innerWidth < 768 ? 28 : 40,
    fontWeight: 900,
    color: 'white',
    margin: 0,
    marginBottom: 6,
  },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.5)', margin: 0 },
  statCard: { backgroundColor: '#111', padding: '16px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16, alignSelf: 'flex-start' },
  statValue: { fontSize: 28, fontWeight: 900, color: 'white', lineHeight: '30px' },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: '#0d0d0d', borderRadius: 16, padding: typeof window !== 'undefined' && window.innerWidth < 768 ? '20px 16px' : '28px', marginBottom: 20, border: '1px solid rgba(255,255,255,0.05)' },
  cardHeader: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: 1 },
  errorBanner: {
    marginBottom: 16,
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(127,29,29,0.35)',
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: 600,
  },
  // Responsive: single column on mobile, 3-column on desktop
  formGrid: {
    display: 'grid',
    gridTemplateColumns: typeof window !== 'undefined' && window.innerWidth < 768 ? '1fr' : 'repeat(3, 1fr)',
    gap: 16,
    alignItems: 'end',
  },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '13px 16px', color: 'white', fontSize: 16, border: '1px solid rgba(255,255,255,0.08)', outline: 'none', fontFamily: 'Outfit', width: '100%', boxSizing: 'border-box' as const },
  addButton: { backgroundColor: '#E50914', height: 48, borderRadius: 8, border: 'none', color: 'white', fontWeight: 900, fontSize: 16, cursor: 'pointer', fontFamily: 'Outfit', width: '100%', minHeight: 48 },
  // On mobile, hide table header and stack rows like cards
  tableHeader: {
    display: typeof window !== 'undefined' && window.innerWidth < 768 ? 'none' : 'flex',
    flexDirection: 'row',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    padding: '0 10px 16px',
  },
  columnLabel: { fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 },
  tableRow: {
    display: 'flex',
    flexDirection: typeof window !== 'undefined' && window.innerWidth < 768 ? 'column' : 'row',
    padding: typeof window !== 'undefined' && window.innerWidth < 768 ? '16px' : '16px 10px',
    alignItems: typeof window !== 'undefined' && window.innerWidth < 768 ? 'flex-start' : 'center',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    gap: typeof window !== 'undefined' && window.innerWidth < 768 ? 12 : 0,
    borderRadius: typeof window !== 'undefined' && window.innerWidth < 768 ? 10 : 0,
    backgroundColor: typeof window !== 'undefined' && window.innerWidth < 768 ? 'rgba(255,255,255,0.02)' : 'transparent',
    marginBottom: typeof window !== 'undefined' && window.innerWidth < 768 ? 8 : 0,
  },
  userName: { fontSize: 17, fontWeight: 'bold', color: 'white' },
  userId: { fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  userUrl: { color: 'rgba(255,255,255,0.4)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3, display: 'inline-block' },
  statusText: { fontSize: 11, fontWeight: 900, letterSpacing: 0.5 },
  actionBtn: { width: 40, height: 40, borderRadius: 20, border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', padding: 0, flexShrink: 0 },
  
  // Modal: fullscreen on mobile, centered card on desktop
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: typeof window !== 'undefined' && window.innerWidth < 768 ? 'flex-end' : 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    backgroundColor: '#111',
    width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : 'min(800px, 92vw)',
    maxHeight: typeof window !== 'undefined' && window.innerWidth < 768 ? '92vh' : '88vh',
    borderRadius: typeof window !== 'undefined' && window.innerWidth < 768 ? '24px 24px 0 0' : 24,
    padding: typeof window !== 'undefined' && window.innerWidth < 768 ? '24px 20px' : 40,
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
    overflowY: 'auto',
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 900, color: 'white', margin: 0 },
  closeBtn: { background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalBody: { display: 'flex', flexDirection: 'column', gap: 18 },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 32,
  },
  cancelBtn: { background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '12px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, minHeight: 44 },
  saveBtn: { backgroundColor: '#E50914', border: 'none', color: 'white', padding: '12px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 },
};
