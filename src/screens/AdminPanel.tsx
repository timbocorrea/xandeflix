import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableHighlight, TextInput, ActivityIndicator } from 'react-native';
import { Users, Shield, Link, LogOut, Check, X, ShieldAlert, Plus, Trash2, ExternalLink } from 'lucide-react';
import { useStore } from '../store/useStore';

export const AdminPanel: React.FC = () => {
  const { managedUsers, setManagedUsers, setIsAdminMode } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // New User Form State
  const [newUserName, setNewUserName] = useState('');
  const [newUserUrl, setNewUserUrl] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const token = process.env.VITE_ADMIN_TOKEN || 'xandeflix-admin-2026';
      const response = await fetch('/api/admin/users', {
        headers: { 'x-admin-token': token }
      });
      if (!response.ok) throw new Error('Não foi possível carregar os usuários.');
      const data = await response.json();
      setManagedUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [setManagedUsers]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    setActionLoading(userId);
    try {
      const token = process.env.VITE_ADMIN_TOKEN || 'xandeflix-admin-2026';
      await fetch('/api/admin/user/status', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-token': token 
        },
        body: JSON.stringify({ userId, blocked: !currentStatus })
      });
      await fetchUsers();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddUser = async () => {
    if (!newUserName) return;
    setLoading(true);
    try {
      const token = process.env.VITE_ADMIN_TOKEN || 'xandeflix-admin-2026';
      await fetch('/api/admin/user/add', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-token': token 
        },
        body: JSON.stringify({ name: newUserName, playlistUrl: newUserUrl })
      });
      setNewUserName('');
      setNewUserUrl('');
      await fetchUsers();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Tem certeza que deseja remover este acesso?')) return;
    setActionLoading(userId);
    try {
      const token = process.env.VITE_ADMIN_TOKEN || 'xandeflix-admin-2026';
      await fetch(`/api/admin/user/${userId}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': token }
      });
      await fetchUsers();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Sidebar - Simple for Admin */}
      <View style={styles.sidebar}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>XANDEFLIX</Text>
          <Text style={styles.adminBadge}>ADMIN</Text>
        </View>
        <TouchableHighlight 
          onPress={() => setIsAdminMode(false)}
          underlayColor="rgba(255,255,255,0.1)"
          style={styles.navItem}
        >
          <View style={styles.navRow}>
            <LogOut size={20} color="white" />
            <Text style={styles.navText}>Voltar ao Início</Text>
          </View>
        </TouchableHighlight>
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Painel de Controle</Text>
            <Text style={styles.subtitle}>Gerencie os acessos e assinaturas dos usuários.</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Users size={24} color="#E50914" />
              <View style={styles.statInfo}>
                <Text style={styles.statValue}>{managedUsers.length}</Text>
                <Text style={styles.statLabel}>Usuários Ativos</Text>
              </View>
            </View>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Add User Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Plus size={20} color="#E50914" />
              <Text style={styles.cardTitle}>Novo Acesso</Text>
            </View>
            <View style={styles.formRow}>
              <TextInput 
                style={styles.input} 
                placeholder="Nome do Usuário" 
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={newUserName}
                onChangeText={setNewUserName}
              />
              <TextInput 
                style={[styles.input, { flex: 2 }]} 
                placeholder="URL da Playlist (M3U)" 
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={newUserUrl}
                onChangeText={setNewUserUrl}
              />
              <TouchableHighlight 
                onPress={handleAddUser}
                style={styles.addButton}
                underlayColor="#B80710"
              >
                <Text style={styles.buttonText}>Gerar Acesso</Text>
              </TouchableHighlight>
            </View>
          </View>

          {/* Users Table */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Shield size={20} color="#E50914" />
              <Text style={styles.cardTitle}>Gerenciar Usuários</Text>
            </View>

            {loading ? (
              <ActivityIndicator color="#E50914" style={{ margin: 40 }} />
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.columnLabel, { flex: 1.5 }]}>USUÁRIO</Text>
                  <Text style={[styles.columnLabel, { flex: 2 }]}>LISTA M3U</Text>
                  <Text style={[styles.columnLabel, { flex: 1 }]}>STATUS</Text>
                  <Text style={[styles.columnLabel, { flex: 1, textAlign: 'right' }]}>AÇÕES</Text>
                </View>

                {managedUsers.map((user) => (
                  <View key={user.id} style={styles.tableRow}>
                    <View style={[styles.cell, { flex: 1.5 }]}>
                      <Text style={styles.userName}>{user.name}</Text>
                      <Text style={styles.userId}>{user.id}</Text>
                    </View>
                    <View style={[styles.cell, { flex: 2 }]}>
                      <View style={styles.urlContainer}>
                        <Link size={12} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.userUrl} numberOfLines={1}>{user.playlistUrl}</Text>
                      </View>
                    </View>
                    <View style={[styles.cell, { flex: 1 }]}>
                      <View style={[
                        styles.statusBadge, 
                        { backgroundColor: user.isBlocked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)' }
                      ]}>
                        <View style={[
                          styles.statusDot, 
                          { backgroundColor: user.isBlocked ? '#EF4444' : '#22C55E' }
                        ]} />
                        <Text style={[
                          styles.statusText, 
                          { color: user.isBlocked ? '#EF4444' : '#22C55E' }
                        ]}>
                          {user.isBlocked ? 'BLOQUEADO' : 'ATIVO'}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.cell, { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }]}>
                      <TouchableHighlight 
                        onPress={() => handleToggleStatus(user.id, user.isBlocked)}
                        style={[styles.actionBtn, { borderColor: user.isBlocked ? '#22C55E' : '#EF4444' }]}
                        underlayColor="rgba(255,255,255,0.1)"
                      >
                        {user.isBlocked ? <Check size={16} color="#22C55E" /> : <ShieldAlert size={16} color="#EF4444" />}
                      </TouchableHighlight>
                      <TouchableHighlight 
                        onPress={() => handleDeleteUser(user.id)}
                        style={[styles.actionBtn, { borderColor: 'rgba(255,255,255,0.1)' }]}
                        underlayColor="rgba(255,255,255,0.1)"
                      >
                        <Trash2 size={16} color="rgba(255,255,255,0.6)" />
                      </TouchableHighlight>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    flexDirection: 'row',
  },
  sidebar: {
    width: 280,
    backgroundColor: '#0a0a0a',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.05)',
    padding: 30,
  },
  logoContainer: {
    marginBottom: 60,
  },
  logo: {
    fontSize: 28,
    fontWeight: '900',
    color: '#E50914',
    fontStyle: 'italic',
    fontFamily: 'Outfit',
  },
  adminBadge: {
    color: 'white',
    fontSize: 10,
    fontWeight: '900',
    backgroundColor: '#E50914',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    borderRadius: 2,
    marginTop: -4,
  },
  navItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Outfit',
  },
  content: {
    flex: 1,
    padding: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: 'white',
    fontFamily: 'Outfit',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.5)',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  statCard: {
    backgroundColor: '#111',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    minWidth: 240,
  },
  statInfo: {
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '900',
    color: 'white',
    fontFamily: 'Outfit',
    lineHeight: 34,
  },
  statLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#0d0d0d',
    borderRadius: 20,
    padding: 30,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 30,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: 'white',
    fontFamily: 'Outfit',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  formRow: {
    flexDirection: 'row',
    gap: 16,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: 'white',
    fontSize: 16,
    fontFamily: 'Outfit',
  },
  addButton: {
    backgroundColor: '#E50914',
    paddingHorizontal: 30,
    justifyContent: 'center',
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 16,
    fontFamily: 'Outfit',
  },
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
  },
  columnLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  cell: {
    justifyContent: 'center',
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    fontFamily: 'Outfit',
  },
  userId: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    fontFamily: 'monospace',
  },
  urlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userUrl: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
