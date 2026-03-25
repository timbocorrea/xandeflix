import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableHighlight, TextInput, Modal, ScrollView } from 'react-native';
import { motion } from 'motion/react';
import { X, Save, RotateCcw, Link, List, Check } from 'lucide-react';
import { Category } from '../types';

interface SettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSave: (url: string) => void;
  currentUrl: string;
  onLogout?: () => void;
  allCategories: Category[];
  hiddenCategoryIds: string[];
  onToggleCategory: (id: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isVisible, 
  onClose, 
  onSave, 
  currentUrl, 
  onLogout,
  allCategories,
  hiddenCategoryIds,
  onToggleCategory
}) => {
  const [url, setUrl] = useState(currentUrl);
  const [activeTab, setActiveTab] = useState<'general' | 'categories'>('general');
  const DEFAULT_URL = 'http://dnsd1.space/get.php?username=952279118&password=823943744&type=m3u_plus&output=mpegts';

  useEffect(() => {
    setUrl(currentUrl);
  }, [currentUrl, isVisible]);

  const handleSave = () => {
    onSave(url);
    onClose();
  };

  const handleReset = () => {
    setUrl(DEFAULT_URL);
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
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 25 },
            shadowOpacity: 0.5,
            shadowRadius: 50,
            overflow: 'hidden',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Link size={24} color="#E50914" style={{ marginRight: 12 }} />
              <Text style={styles.title}>Configurações</Text>
            </View>
            <TouchableHighlight
              onPress={onClose}
              underlayColor="rgba(255,255,255,0.1)"
              style={styles.closeButton}
            >
              <X size={24} color="white" />
            </TouchableHighlight>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableHighlight
              onPress={() => setActiveTab('general')}
              underlayColor="rgba(255,255,255,0.05)"
              style={StyleSheet.flatten([styles.tab, activeTab === 'general' && styles.activeTab])}
            >
              <View style={styles.tabInner}>
                <Link size={18} color={activeTab === 'general' ? '#E50914' : 'rgba(255,255,255,0.5)'} />
                <Text style={StyleSheet.flatten([styles.tabText, activeTab === 'general' && styles.activeTabText])}>Geral</Text>
              </View>
            </TouchableHighlight>
            <TouchableHighlight
              onPress={() => setActiveTab('categories')}
              underlayColor="rgba(255,255,255,0.05)"
              style={StyleSheet.flatten([styles.tab, activeTab === 'categories' && styles.activeTab])}
            >
              <View style={styles.tabInner}>
                <List size={18} color={activeTab === 'categories' ? '#E50914' : 'rgba(255,255,255,0.5)'} />
                <Text style={StyleSheet.flatten([styles.tabText, activeTab === 'categories' && styles.activeTabText])}>Categorias</Text>
              </View>
            </TouchableHighlight>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {activeTab === 'general' ? (
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>URL da Lista M3U8 / M3U</Text>
                <TextInput
                  style={styles.input}
                  value={url}
                  onChangeText={setUrl}
                  placeholder="http://exemplo.com/lista.m3u"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoFocus
                  // @ts-ignore
                  className="focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none"
                />
                <Text style={styles.hint}>
                  Insira a URL completa fornecida pelo seu provedor de IPTV. O aplicativo irá processar os canais, filmes e séries automaticamente.
                </Text>

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
                      <RotateCcw size={18} color="#ef4444" style={{ marginRight: 8 }} />
                      <Text style={StyleSheet.flatten([styles.buttonText, { color: '#ef4444' }])}>Trocar Lista</Text>
                    </View>
                  </TouchableHighlight>

                  <TouchableHighlight
                    onPress={handleReset}
                    underlayColor="rgba(255,255,255,0.1)"
                    style={styles.resetButton}
                  >
                    <View style={styles.buttonInner}>
                      <RotateCcw size={18} color="white" style={{ marginRight: 8 }} />
                      <Text style={styles.buttonText}>Restaurar Padrão</Text>
                    </View>
                  </TouchableHighlight>

                  <TouchableHighlight
                    onPress={handleSave}
                    underlayColor="#b91c1c"
                    style={styles.saveButton}
                  >
                    <View style={styles.buttonInner}>
                      <Save size={18} color="white" style={{ marginRight: 8 }} />
                      <Text style={styles.buttonText}>Salvar e Atualizar</Text>
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
                    const isHidden = hiddenCategoryIds.includes(category.id);
                    return (
                      <TouchableHighlight
                        key={category.id}
                        onPress={() => onToggleCategory(category.id)}
                        underlayColor="rgba(255,255,255,0.05)"
                        style={styles.categoryItem}
                      >
                        <View style={styles.categoryItemInner}>
                          <View style={StyleSheet.flatten([
                            styles.checkbox,
                            !isHidden && styles.checkboxChecked
                          ])}>
                            {!isHidden && <Check size={14} color="white" />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={StyleSheet.flatten([styles.categoryName, isHidden && styles.categoryNameHidden])}>
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
