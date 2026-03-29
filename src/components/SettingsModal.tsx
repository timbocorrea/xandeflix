import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableHighlight, TextInput, Modal, ScrollView } from 'react-native';
import { motion } from 'motion/react';
import { X, Save, RotateCcw, Link, List, Check } from 'lucide-react';
import { Category } from '../types';

interface SettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSave: (url: string, hiddenIds: string[]) => void;
  currentUrl: string;
  onLogout?: () => void;
  allCategories: Category[];
  hiddenCategoryIds: string[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isVisible, 
  onClose, 
  onSave, 
  currentUrl, 
  onLogout,
  allCategories,
  hiddenCategoryIds
}) => {
  const [localHiddenIds, setLocalHiddenIds] = useState<string[]>(hiddenCategoryIds);
  const [activeTab, setActiveTab] = useState<'general' | 'categories'>('general');

  useEffect(() => {
    setLocalHiddenIds(hiddenCategoryIds);
  }, [hiddenCategoryIds, isVisible]);

  const handleSave = () => {
    onSave(currentUrl, localHiddenIds);
    onClose();
  };

  const toggleLocalCategory = (id: string) => {
    setLocalHiddenIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={{
            backgroundColor: '#1a1a1a',
            width: 700,
            height: 600,
            borderRadius: 16,
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)' as any,
            overflow: 'hidden',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <span style={{ marginRight: 12 }}><Link size={24} color="#E50914" /></span>
              <Text style={styles.title}>Configurações</Text>
            </View>
            <TouchableHighlight
              onPress={onClose}
              underlayColor="rgba(255,255,255,0.1)"
              style={styles.closeButton}
            >
              <View>
                <span><X size={24} color="white" /></span>
              </View>
            </TouchableHighlight>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableHighlight
              onPress={() => setActiveTab('general')}
              underlayColor="rgba(255,255,255,0.05)"
              style={[styles.tab, activeTab === 'general' && styles.activeTab]}
            >
              <View style={styles.tabInner}>
                <span><Link size={18} color={activeTab === 'general' ? '#E50914' : 'rgba(255,255,255,0.5)'} /></span>
                <Text style={[styles.tabText, activeTab === 'general' && styles.activeTabText]}>Sessão</Text>
              </View>
            </TouchableHighlight>
            <TouchableHighlight
              onPress={() => setActiveTab('categories')}
              underlayColor="rgba(255,255,255,0.05)"
              style={[styles.tab, activeTab === 'categories' && styles.activeTab]}
            >
              <View style={styles.tabInner}>
                <span><List size={18} color={activeTab === 'categories' ? '#E50914' : 'rgba(255,255,255,0.5)'} /></span>
                <Text style={[styles.tabText, activeTab === 'categories' && styles.activeTabText]}>Categorias</Text>
              </View>
            </TouchableHighlight>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {activeTab === 'general' ? (
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Informações do Aplicativo</Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                  <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>Xandeflix Premium</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Versão 1.2.5 • Estável</Text>
                  <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 16 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 20 }}>
                    Este aplicativo é um reprodutor de mídia para listas IPTV. A gestão de conteúdo é realizada de forma centralizada pelo administrador.
                  </Text>
                </View>

                <View style={styles.actions}>
                  <TouchableHighlight
                    onPress={() => {
                      if (onLogout) {
                        onLogout();
                      } else {
                        localStorage.removeItem('xandeflix_playlist_url');
                        window.location.reload();
                      }
                    }}
                    underlayColor="rgba(239, 68, 68, 0.1)"
                    style={styles.logoutButton}
                  >
                    <View style={styles.buttonInner}>
                      <span style={{ marginRight: 8 }}><RotateCcw size={18} color="#ef4444" /></span>
                      <Text style={[styles.buttonText, { color: '#ef4444' }]}>Terminar Sessão</Text>
                    </View>
                  </TouchableHighlight>
                </View>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Gerenciar Visibilidade das Categorias</Text>
                <Text style={styles.hint}>
                  Selecione quais categorias você deseja que apareçam na tela principal.
                </Text>
                <ScrollView style={styles.categoryList} showsVerticalScrollIndicator={false}>
                  {allCategories.map((category) => {
                    const isHidden = localHiddenIds.includes(category.id);
                    return (
                      <TouchableHighlight
                        key={category.id}
                        onPress={() => toggleLocalCategory(category.id)}
                        underlayColor="rgba(255,255,255,0.05)"
                        style={styles.categoryItem}
                      >
                        <View style={styles.categoryItemInner}>
                          <View style={[
                            styles.checkbox,
                            !isHidden && styles.checkboxChecked
                          ]}>
                            {!isHidden && <span><Check size={14} color="white" /></span>}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.categoryName, isHidden && styles.categoryNameHidden]}>
                              {category.title}
                            </Text>
                            <Text style={styles.categoryCount}>
                              {category.items.length} itens • {category.type === 'live' ? 'TV ao Vivo' : category.type === 'movie' ? 'Filme' : 'Série'}
                            </Text>
                          </View>
                        </View>
                      </TouchableHighlight>
                    );
                  })}
                </ScrollView>
                
                <View style={[styles.actions, { marginTop: 24 }]}>
                  <TouchableHighlight
                    onPress={handleSave}
                    underlayColor="#b91c1c"
                    style={styles.saveButton}
                  >
                    <View style={styles.buttonInner}>
                      <span style={{ marginRight: 8 }}><Save size={18} color="white" /></span>
                      <Text style={styles.buttonText}>Confirmar Alterações</Text>
                    </View>
                  </TouchableHighlight>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'Outfit',
  },
  closeButton: {
    padding: 8,
    borderRadius: 50,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tab: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#E50914',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabText: {
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 'bold',
    fontSize: 14,
  },
  activeTabText: {
    color: 'white',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    color: 'white',
    fontSize: 16,
    marginBottom: 12,
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 24,
  },
  categoryList: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  categoryItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  categoryItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#E50914',
    borderColor: '#E50914',
  },
  categoryName: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  categoryNameHidden: {
    color: 'rgba(255,255,255,0.3)',
    textDecorationLine: 'line-through',
  },
  categoryCount: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    alignItems: 'center',
    marginTop: 'auto',
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    marginRight: 'auto',
  },
  resetButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#E50914',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
