import React, { useState, useEffect, useCallback } from 'react';
import { Users, Shield, Link as LinkIcon, LogOut, Check, ShieldAlert, Plus, Trash2, X, Edit2, Save, Eye, ChevronDown, ChevronRight, Folder, FolderOpen, Tv, Film, Clapperboard, FileVideo, Square, CheckSquare } from 'lucide-react';
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
  const [savingHidden, setSavingHidden] = useState(false);

  const handlePreviewUser = async (user: any) => {
    setPreviewingUser(user);
    setPreviewCategories(null);
    setExpandedRoot(null);
    setExpandedCategory(null);
    setHiddenCategories(user.hiddenCategories || []);
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
      const response = await fetch(`/api/admin/user/${previewingUser.id}/hiddenCategories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': authToken },
        body: JSON.stringify({ categories: hiddenCategories })
      });
      if (!response.ok) throw new Error('Não foi possível salvar os filtros.');
      const updatedManagedUsers = managedUsers.map(u => 
        u.id === previewingUser.id ? { ...u, hiddenCategories } : u
      );
      setManagedUsers(updatedManagedUsers);
      alert('Filtros salvos com sucesso!');
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
                 <p style={{ color: 'rgba(255,255,255,0.5)', margin: '4px 0 0 0', fontSize: 14 }}>
                   {previewingUser.playlistUrl || 'Nenhuma lista vinculada'}
                 </p>
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
                       const rootCategories = previewCategories.filter(c => c.type === root.id);
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
                                       <span style={{ fontWeight: 'bold', color: 'white', flex: 1, textDecoration: hiddenCategories.includes(cat.id) ? 'line-through' : 'none' }}>{cat.title}</span>
                                       <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{cat.itemCount} itens</span>
                                     </div>

                                     {/* Item Level (Files) */}
                                     {isCatExpanded && cat.items && cat.items.length > 0 && (
                                       <div style={{ paddingLeft: 44, display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 12, paddingTop: 4 }}>
                                         {cat.items.slice(0, 500).map((itemTitle: string, itemIdx: number) => (
                                           <div key={itemIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', opacity: hiddenCategories.includes(cat.id) ? 0.3 : 1 }}>
                                             <Icon><FileVideo size={14} color="rgba(255,255,255,0.2)" /></Icon>
                                             <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{itemTitle}</span>
                                           </div>
                                         ))}
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
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'row', height: '125vh', width: '125vw', backgroundColor: '#050505', fontFamily: 'Outfit, sans-serif',
    transform: 'scale(0.8)', transformOrigin: 'top left', overflowX: 'hidden',
  },
  sidebar: {
    width: 280, backgroundColor: '#0a0a0a', borderRight: '1px solid rgba(255,255,255,0.05)', padding: 30,
    display: 'flex', flexDirection: 'column',
  },
  logoContainer: { marginBottom: 60 },
  logo: { fontSize: 28, fontWeight: 900, color: '#E50914', fontStyle: 'italic' },
  adminBadge: { color: 'white', fontSize: 10, fontWeight: 900, backgroundColor: '#E50914', display: 'inline-block', padding: '2px 6px', borderRadius: 2, marginTop: -4 },
  navItem: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: 'none', color: 'white', fontSize: 16, fontWeight: 'bold', fontFamily: 'Outfit', transition: 'background 0.2s' },
  navText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  content: { flex: 1, padding: 60, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 60 },
  title: { fontSize: 48, fontWeight: 900, color: 'white', margin: 0, marginBottom: 8 },
  subtitle: { fontSize: 18, color: 'rgba(255,255,255,0.5)', margin: 0 },
  statCard: { backgroundColor: '#111', padding: 24, borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 20, minWidth: 240 },
  statValue: { fontSize: 32, fontWeight: 900, color: 'white', lineHeight: '34px' },
  statLabel: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: '#0d0d0d', borderRadius: 20, padding: 30, marginBottom: 30, border: '1px solid rgba(255,255,255,0.05)' },
  cardHeader: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 30 },
  cardTitle: { fontSize: 20, fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: 1 },
  errorBanner: {
    marginBottom: 18,
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(127,29,29,0.35)',
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: 600,
  },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, alignItems: 'end' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '12px 20px', color: 'white', fontSize: 16, border: 'none', outline: 'none', fontFamily: 'Outfit' },
  addButton: { backgroundColor: '#E50914', height: 48, borderRadius: 8, border: 'none', color: 'white', fontWeight: 900, fontSize: 16, cursor: 'pointer', fontFamily: 'Outfit' },
  tableHeader: { display: 'flex', flexDirection: 'row', paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0 10px 20px' },
  columnLabel: { fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 },
  tableRow: { display: 'flex', flexDirection: 'row', padding: '20px 10px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.02)' },
  userName: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  userId: { fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' },
  userUrl: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3, display: 'inline-block' },
  statusText: { fontSize: 12, fontWeight: 900, letterSpacing: 0.5 },
  actionBtn: { width: 36, height: 36, borderRadius: 18, border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', padding: 0 },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '125vw', height: '125vh', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { backgroundColor: '#111', width: 800, borderRadius: 24, padding: 40, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  modalTitle: { fontSize: 24, fontWeight: 900, color: 'white', margin: 0 },
  closeBtn: { background: 'transparent', border: 'none', cursor: 'pointer' },
  modalBody: { display: 'flex', flexDirection: 'column', gap: 20 },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 40 },
  cancelBtn: { background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '12px 24px', borderRadius: 12, cursor: 'pointer', fontWeight: 700 },
  saveBtn: { backgroundColor: '#E50914', border: 'none', color: 'white', padding: '12px 24px', borderRadius: 12, cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 },
};
