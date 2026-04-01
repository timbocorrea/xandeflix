import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableHighlight, View } from 'react-native';
import { Check, KeyRound, Link, List, RefreshCw, RotateCcw, Save, Shield, Smartphone, X } from 'lucide-react';
import { Category } from '../types';
import { useStore } from '../store/useStore';
import { isAdultCategory } from '../lib/adultContent';
import { clearPlaylistCache } from '../lib/localCache';
import { usePlaylist } from '../hooks/usePlaylist';

interface SettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSave: (url: string, hiddenIds: string[]) => void;
  currentUrl: string;
  onLogout?: () => void;
  allCategories: Category[];
  hiddenCategoryIds: string[];
}

type SettingsTab = 'general' | 'categories' | 'adult';
type PendingTotpSetup = {
  issuer: string;
  accountName: string;
  manualEntryKey: string;
  otpauthUri: string;
  pendingSecret: string;
} | null;

async function readResponseError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return data?.error || data?.message || fallback;
  } catch {
    return fallback;
  }
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isVisible,
  onClose,
  onSave,
  currentUrl,
  onLogout,
  allCategories,
  hiddenCategoryIds,
}) => {
  const adultAccess = useStore((state) => state.adultAccess);
  const isAdultUnlocked = useStore((state) => state.isAdultUnlocked);
  const setAdultAccessSettings = useStore((state) => state.setAdultAccessSettings);
  const unlockAdultContent = useStore((state) => state.unlockAdultContent);
  const lockAdultContent = useStore((state) => state.lockAdultContent);
  const { fetchPlaylist } = usePlaylist();

  const [localHiddenIds, setLocalHiddenIds] = useState<string[]>(hiddenCategoryIds);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const [unlockPassword, setUnlockPassword] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('');
  const [changeCurrentPassword, setChangeCurrentPassword] = useState('');
  const [changeNewPassword, setChangeNewPassword] = useState('');
  const [changeNewPasswordConfirm, setChangeNewPasswordConfirm] = useState('');
  const [changeTotpCode, setChangeTotpCode] = useState('');
  const [totpSetupPassword, setTotpSetupPassword] = useState('');
  const [pendingTotpSetup, setPendingTotpSetup] = useState<PendingTotpSetup>(null);
  const [totpVerificationCode, setTotpVerificationCode] = useState('');
  const [disableTotpPassword, setDisableTotpPassword] = useState('');
  const [disableTotpCode, setDisableTotpCode] = useState('');

  const authToken = typeof window === 'undefined' ? '' : localStorage.getItem('xandeflix_auth_token') || '';
  const adultCategoryCount = useMemo(
    () => allCategories.filter((category) => isAdultCategory(category)).length,
    [allCategories],
  );
  const adultLocked = !adultAccess.enabled || !isAdultUnlocked;

  useEffect(() => {
    setLocalHiddenIds(hiddenCategoryIds);
  }, [hiddenCategoryIds, isVisible]);

  useEffect(() => {
    if (!isVisible) {
      setActiveTab('general');
      setStatusMessage(null);
      setErrorMessage(null);
      setLoadingAction(null);
      setUnlockPassword('');
      setCreatePassword('');
      setCreatePasswordConfirm('');
      setChangeCurrentPassword('');
      setChangeNewPassword('');
      setChangeNewPasswordConfirm('');
      setChangeTotpCode('');
      setTotpSetupPassword('');
      setPendingTotpSetup(null);
      setTotpVerificationCode('');
      setDisableTotpPassword('');
      setDisableTotpCode('');
    }
  }, [isVisible]);

  const setFeedback = (message?: string, error?: string) => {
    setStatusMessage(message || null);
    setErrorMessage(error || null);
  };

  const postAdultAction = async (url: string, body: Record<string, unknown>, loadingKey: string) => {
    setLoadingAction(loadingKey);
    setFeedback();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': authToken },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await readResponseError(response, 'Operacao nao concluida.'));
      }

      return await response.json();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSave = () => {
    onSave(currentUrl, localHiddenIds);
    onClose();
  };

  const handleRefreshPlaylist = async () => {
    setLoadingAction('refresh');
    setFeedback();
    try {
      await clearPlaylistCache();
      await fetchPlaylist();
      setFeedback('Lista sincronizada com sucesso!');
    } catch (error: any) {
      setFeedback(undefined, 'Falha ao sincronizar: ' + error.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const toggleLocalCategory = (id: string) => {
    setLocalHiddenIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleAdultUnlock = async () => {
    if (!unlockPassword.trim()) {
      setFeedback(undefined, 'Informe a senha do conteudo adulto.');
      return;
    }

    try {
      const data = await postAdultAction('/api/user/adult-access/unlock', { password: unlockPassword }, 'unlock');
      setAdultAccessSettings(data.adultAccess);
      unlockAdultContent();
      setUnlockPassword('');
      setFeedback('Conteudo adulto liberado nesta sessao.');
    } catch (error: any) {
      setFeedback(undefined, error.message);
    }
  };

  const handleAdultPasswordSave = async () => {
    const changing = adultAccess.enabled;
    const nextPassword = (changing ? changeNewPassword : createPassword).trim();
    const confirmPassword = (changing ? changeNewPasswordConfirm : createPasswordConfirm).trim();

    if (nextPassword.length < 4) {
      setFeedback(undefined, 'A senha adulta precisa ter pelo menos 4 caracteres.');
      return;
    }

    if (nextPassword !== confirmPassword) {
      setFeedback(undefined, 'A confirmacao da senha nao confere.');
      return;
    }

    try {
      const data = await postAdultAction(
        '/api/user/adult-access/password',
        {
          currentPassword: changing ? changeCurrentPassword : undefined,
          newPassword: nextPassword,
          totpCode: adultAccess.totpEnabled ? changeTotpCode : undefined,
        },
        'password',
      );
      setAdultAccessSettings(data.adultAccess);
      setCreatePassword('');
      setCreatePasswordConfirm('');
      setChangeCurrentPassword('');
      setChangeNewPassword('');
      setChangeNewPasswordConfirm('');
      setChangeTotpCode('');
      setFeedback(changing ? 'Senha adulta atualizada.' : 'Senha adulta criada.');
    } catch (error: any) {
      setFeedback(undefined, error.message);
    }
  };

  const handleBeginTotpSetup = async () => {
    if (!totpSetupPassword.trim()) {
      setFeedback(undefined, 'Informe a senha adulta atual para ativar o autenticador.');
      return;
    }

    try {
      const data = await postAdultAction(
        '/api/user/adult-access/totp/setup',
        { adultPassword: totpSetupPassword },
        'totp-setup',
      );
      setPendingTotpSetup({
        issuer: data.issuer,
        accountName: data.accountName,
        manualEntryKey: data.manualEntryKey,
        otpauthUri: data.otpauthUri,
        pendingSecret: data.pendingSecret,
      });
      setFeedback('Cadastre a chave no autenticador e confirme o codigo.');
    } catch (error: any) {
      setFeedback(undefined, error.message);
    }
  };

  const handleConfirmTotpSetup = async () => {
    if (!pendingTotpSetup || !totpVerificationCode.trim()) {
      setFeedback(undefined, 'Informe o codigo do autenticador para concluir.');
      return;
    }

    try {
      const data = await postAdultAction(
        '/api/user/adult-access/totp/verify',
        {
          adultPassword: totpSetupPassword,
          pendingSecret: pendingTotpSetup.pendingSecret,
          code: totpVerificationCode,
        },
        'totp-confirm',
      );
      setAdultAccessSettings(data.adultAccess);
      setPendingTotpSetup(null);
      setTotpSetupPassword('');
      setTotpVerificationCode('');
      setFeedback('Autenticador ativado.');
    } catch (error: any) {
      setFeedback(undefined, error.message);
    }
  };

  const handleDisableTotp = async () => {
    if (!disableTotpPassword.trim() || !disableTotpCode.trim()) {
      setFeedback(undefined, 'Informe a senha adulta e o codigo atual do autenticador.');
      return;
    }

    try {
      const data = await postAdultAction(
        '/api/user/adult-access/totp/disable',
        { adultPassword: disableTotpPassword, code: disableTotpCode },
        'totp-disable',
      );
      setAdultAccessSettings(data.adultAccess);
      setDisableTotpPassword('');
      setDisableTotpCode('');
      setFeedback('Autenticador desativado.');
    } catch (error: any) {
      setFeedback(undefined, error.message);
    }
  };

  const renderTabButton = (tab: SettingsTab, label: string, icon: React.ReactNode) => (
    <TouchableHighlight
      onPress={() => setActiveTab(tab)}
      underlayColor="rgba(255,255,255,0.05)"
      style={[styles.tab, activeTab === tab && styles.activeTab]}
    >
      <View style={styles.tabInner}>
        <span>{icon}</span>
        <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{label}</Text>
      </View>
    </TouchableHighlight>
  );

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerTitle}>
              <span style={{ marginRight: 12 }}>
                <Link size={24} color="#E50914" />
              </span>
              <Text style={styles.title}>Configuracoes</Text>
            </View>
            <TouchableHighlight onPress={onClose} underlayColor="rgba(255,255,255,0.1)" style={styles.closeButton}>
              <View>
                <span>
                  <X size={22} color="white" />
                </span>
              </View>
            </TouchableHighlight>
          </View>

          <View style={styles.tabs}>
            {renderTabButton('general', 'Sessao', <Link size={18} color={activeTab === 'general' ? '#E50914' : 'rgba(255,255,255,0.5)'} />)}
            {renderTabButton('categories', 'Categorias', <List size={18} color={activeTab === 'categories' ? '#E50914' : 'rgba(255,255,255,0.5)'} />)}
            {renderTabButton('adult', 'Adulto', <Shield size={18} color={activeTab === 'adult' ? '#E50914' : 'rgba(255,255,255,0.5)'} />)}
          </View>

          <View style={styles.content}>
            {activeTab === 'general' ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Aplicativo</Text>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Xandeflix Premium</Text>
                  <Text style={styles.cardText}>Sessao local, lista IPTV centralizada e bloqueio adulto por usuario.</Text>
                  <TouchableHighlight
                    onPress={handleRefreshPlaylist}
                    underlayColor="rgba(255,255,255,0.08)"
                    style={[styles.secondaryButton, { marginTop: 8, width: '100%', borderColor: 'rgba(255,255,255,0.15)' }]}
                    disabled={loadingAction === 'refresh'}
                  >
                    <View style={styles.buttonInner}>
                      <span style={{ marginRight: 10 }}>
                        <RefreshCw size={18} color="#fff" style={loadingAction === 'refresh' ? { animation: 'spin 2s linear infinite' } : {}} />
                      </span>
                      <Text style={styles.buttonText}>
                        {loadingAction === 'refresh' ? 'Sincronizando...' : 'Sincronizar Lista'}
                      </Text>
                    </View>
                  </TouchableHighlight>
                </View>

                {statusMessage && activeTab === 'general' ? <View style={styles.successBox}><Text style={styles.noticeText}>{statusMessage}</Text></View> : null}
                {errorMessage && activeTab === 'general' ? <View style={styles.errorBox}><Text style={styles.noticeText}>{errorMessage}</Text></View> : null}

                <TouchableHighlight
                  onPress={() => {
                    if (onLogout) onLogout();
                    else {
                      localStorage.removeItem('xandeflix_playlist_url');
                      window.location.reload();
                    }
                  }}
                  underlayColor="rgba(239,68,68,0.1)"
                  style={styles.secondaryButton}
                >
                  <View style={styles.buttonInner}>
                    <span style={{ marginRight: 8 }}>
                      <RotateCcw size={18} color="#ef4444" />
                    </span>
                    <Text style={[styles.buttonText, { color: '#ef4444' }]}>Terminar sessao</Text>
                  </View>
                </TouchableHighlight>
              </ScrollView>
            ) : null}

            {activeTab === 'categories' ? (
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Categorias visiveis</Text>
                <ScrollView style={styles.listBox} showsVerticalScrollIndicator={false}>
                  {allCategories.map((category) => {
                    const isHidden = localHiddenIds.includes(category.id);
                    return (
                      <TouchableHighlight
                        key={category.id}
                        onPress={() => toggleLocalCategory(category.id)}
                        underlayColor="rgba(255,255,255,0.05)"
                        style={styles.listItem}
                      >
                        <View style={styles.listItemInner}>
                          <View style={[styles.checkbox, !isHidden && styles.checkboxChecked]}>
                            {!isHidden ? <span><Check size={14} color="white" /></span> : null}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.listTitle, isHidden && styles.listTitleHidden]}>{category.title}</Text>
                            <Text style={styles.listMeta}>{category.items.length} itens</Text>
                          </View>
                        </View>
                      </TouchableHighlight>
                    );
                  })}
                </ScrollView>
                <TouchableHighlight onPress={handleSave} underlayColor="#b91c1c" style={styles.primaryButton}>
                  <View style={styles.buttonInner}>
                    <span style={{ marginRight: 8 }}>
                      <Save size={18} color="white" />
                    </span>
                    <Text style={styles.buttonText}>Salvar categorias</Text>
                  </View>
                </TouchableHighlight>
              </View>
            ) : null}

            {activeTab === 'adult' ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Controle adulto</Text>
                <Text style={styles.hint}>
                  {adultCategoryCount > 0
                    ? `${adultCategoryCount} categorias adultas detectadas.`
                    : 'Nenhuma categoria adulta detectada nesta lista, mas a protecao pode ser preparada.'}
                </Text>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {adultLocked ? 'Conteudo adulto bloqueado' : 'Conteudo adulto liberado nesta sessao'}
                  </Text>
                  <Text style={styles.cardText}>
                    {adultAccess.enabled
                      ? adultLocked
                        ? 'As categorias adultas ficam ocultas ate o desbloqueio manual.'
                        : 'O desbloqueio vale apenas para esta sessao do navegador.'
                      : 'Crie uma senha para que o proprio usuario controle o acesso.'}
                  </Text>
                  {adultAccess.enabled ? (
                    isAdultUnlocked ? (
                      <TouchableHighlight
                        onPress={() => {
                          lockAdultContent();
                          setFeedback('Conteudo adulto bloqueado novamente.');
                        }}
                        underlayColor="rgba(239,68,68,0.12)"
                        style={styles.secondaryButton}
                      >
                        <View style={styles.buttonInner}>
                          <Text style={[styles.buttonText, { color: '#f87171' }]}>Bloquear agora</Text>
                        </View>
                      </TouchableHighlight>
                    ) : (
                      <>
                        <TextInput
                          style={styles.input}
                          placeholder="Senha do conteudo adulto"
                          placeholderTextColor="rgba(255,255,255,0.25)"
                          secureTextEntry
                          value={unlockPassword}
                          onChangeText={setUnlockPassword}
                        />
                        <TouchableHighlight
                          onPress={handleAdultUnlock}
                          underlayColor="#b91c1c"
                          style={[styles.primaryButton, loadingAction === 'unlock' && styles.disabled]}
                          disabled={loadingAction === 'unlock'}
                        >
                          <View style={styles.buttonInner}>
                            <Text style={styles.buttonText}>Desbloquear</Text>
                          </View>
                        </TouchableHighlight>
                      </>
                    )
                  ) : null}
                </View>

                {statusMessage ? <View style={styles.successBox}><Text style={styles.noticeText}>{statusMessage}</Text></View> : null}
                {errorMessage ? <View style={styles.errorBox}><Text style={styles.noticeText}>{errorMessage}</Text></View> : null}

                <View style={styles.card}>
                  <View style={styles.sectionTitleRow}>
                    <KeyRound size={16} color="#E50914" />
                    <Text style={styles.sectionTitle}>{adultAccess.enabled ? 'Trocar senha adulta' : 'Criar senha adulta'}</Text>
                  </View>
                  {adultAccess.enabled ? (
                    <>
                      <TextInput style={styles.input} placeholder="Senha atual" placeholderTextColor="rgba(255,255,255,0.25)" secureTextEntry value={changeCurrentPassword} onChangeText={setChangeCurrentPassword} />
                      <TextInput style={styles.input} placeholder="Nova senha ou PIN" placeholderTextColor="rgba(255,255,255,0.25)" secureTextEntry value={changeNewPassword} onChangeText={setChangeNewPassword} />
                      <TextInput style={styles.input} placeholder="Confirmar nova senha" placeholderTextColor="rgba(255,255,255,0.25)" secureTextEntry value={changeNewPasswordConfirm} onChangeText={setChangeNewPasswordConfirm} />
                      {adultAccess.totpEnabled ? (
                        <TextInput style={styles.input} placeholder="Codigo do autenticador" placeholderTextColor="rgba(255,255,255,0.25)" value={changeTotpCode} onChangeText={setChangeTotpCode} keyboardType="number-pad" />
                      ) : null}
                    </>
                  ) : (
                    <>
                      <TextInput style={styles.input} placeholder="Nova senha ou PIN" placeholderTextColor="rgba(255,255,255,0.25)" secureTextEntry value={createPassword} onChangeText={setCreatePassword} />
                      <TextInput style={styles.input} placeholder="Confirmar senha" placeholderTextColor="rgba(255,255,255,0.25)" secureTextEntry value={createPasswordConfirm} onChangeText={setCreatePasswordConfirm} />
                    </>
                  )}
                  <TouchableHighlight
                    onPress={handleAdultPasswordSave}
                    underlayColor="#b91c1c"
                    style={[styles.primaryButton, loadingAction === 'password' && styles.disabled]}
                    disabled={loadingAction === 'password'}
                  >
                    <View style={styles.buttonInner}>
                      <Text style={styles.buttonText}>{adultAccess.enabled ? 'Atualizar senha' : 'Salvar senha'}</Text>
                    </View>
                  </TouchableHighlight>
                </View>

                <View style={styles.card}>
                  <View style={styles.sectionTitleRow}>
                    <Smartphone size={16} color="#E50914" />
                    <Text style={styles.sectionTitle}>TOTP compativel com Google Authenticator</Text>
                  </View>
                  {!adultAccess.enabled ? (
                    <Text style={styles.cardText}>Crie primeiro a senha adulta.</Text>
                  ) : adultAccess.totpEnabled ? (
                    <>
                      <Text style={styles.cardText}>O autenticador esta ativo. Para desativar, confirme a senha adulta e o codigo atual.</Text>
                      <TextInput style={styles.input} placeholder="Senha adulta" placeholderTextColor="rgba(255,255,255,0.25)" secureTextEntry value={disableTotpPassword} onChangeText={setDisableTotpPassword} />
                      <TextInput style={styles.input} placeholder="Codigo atual" placeholderTextColor="rgba(255,255,255,0.25)" value={disableTotpCode} onChangeText={setDisableTotpCode} keyboardType="number-pad" />
                      <TouchableHighlight
                        onPress={handleDisableTotp}
                        underlayColor="rgba(239,68,68,0.12)"
                        style={[styles.secondaryButton, loadingAction === 'totp-disable' && styles.disabled]}
                        disabled={loadingAction === 'totp-disable'}
                      >
                        <View style={styles.buttonInner}>
                          <Text style={[styles.buttonText, { color: '#f87171' }]}>Desativar autenticador</Text>
                        </View>
                      </TouchableHighlight>
                    </>
                  ) : (
                    <>
                      <TextInput style={styles.input} placeholder="Senha adulta atual" placeholderTextColor="rgba(255,255,255,0.25)" secureTextEntry value={totpSetupPassword} onChangeText={setTotpSetupPassword} />
                      {!pendingTotpSetup ? (
                        <TouchableHighlight
                          onPress={handleBeginTotpSetup}
                          underlayColor="#b91c1c"
                          style={[styles.primaryButton, loadingAction === 'totp-setup' && styles.disabled]}
                          disabled={loadingAction === 'totp-setup'}
                        >
                          <View style={styles.buttonInner}>
                            <Text style={styles.buttonText}>Iniciar autenticador</Text>
                          </View>
                        </TouchableHighlight>
                      ) : (
                        <>
                          <Text style={styles.cardText}>No aplicativo autenticador, use inserir chave de configuracao.</Text>
                          <TextInput style={[styles.input, styles.readonlyInput]} editable={false} value={`Emissor: ${pendingTotpSetup.issuer}`} />
                          <TextInput style={[styles.input, styles.readonlyInput]} editable={false} value={`Conta: ${pendingTotpSetup.accountName}`} />
                          <TextInput style={[styles.input, styles.readonlyInput]} editable={false} value={pendingTotpSetup.manualEntryKey} />
                          <TextInput style={[styles.input, styles.readonlyInput]} editable={false} value={pendingTotpSetup.otpauthUri} />
                          <TextInput style={styles.input} placeholder="Codigo de 6 digitos" placeholderTextColor="rgba(255,255,255,0.25)" value={totpVerificationCode} onChangeText={setTotpVerificationCode} keyboardType="number-pad" />
                          <TouchableHighlight
                            onPress={handleConfirmTotpSetup}
                            underlayColor="#b91c1c"
                            style={[styles.primaryButton, loadingAction === 'totp-confirm' && styles.disabled]}
                            disabled={loadingAction === 'totp-confirm'}
                          >
                            <View style={styles.buttonInner}>
                              <Text style={styles.buttonText}>Confirmar autenticador</Text>
                            </View>
                          </TouchableHighlight>
                        </>
                      )}
                    </>
                  )}
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modal: { width: 760, height: 680, backgroundColor: '#161616', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' } as any,
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  headerTitle: { flexDirection: 'row', alignItems: 'center' },
  title: { color: 'white', fontSize: 24, fontWeight: '900', fontFamily: 'Outfit' },
  closeButton: { padding: 8, borderRadius: 50 },
  tabs: { flexDirection: 'row', paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  tab: { paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#E50914' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabText: { color: 'rgba(255,255,255,0.5)', fontWeight: 'bold', fontSize: 14 },
  activeTabText: { color: 'white' },
  content: { flex: 1, padding: 24 },
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 'bold', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  hint: { color: 'rgba(255,255,255,0.45)', fontSize: 13, lineHeight: 20, marginBottom: 18 },
  card: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 16, marginBottom: 16 },
  cardTitle: { color: 'white', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  cardText: { color: 'rgba(255,255,255,0.62)', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { color: 'white', fontSize: 15, fontWeight: '800' },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, color: 'white', fontSize: 15, marginBottom: 12 },
  readonlyInput: { color: 'rgba(255,255,255,0.68)' },
  primaryButton: { alignSelf: 'flex-start', backgroundColor: '#E50914', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  secondaryButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  buttonInner: { flexDirection: 'row', alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  disabled: { opacity: 0.6 },
  successBox: { backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)', borderRadius: 12, padding: 14, marginBottom: 16 },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)', borderRadius: 12, padding: 14, marginBottom: 16 },
  noticeText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 18 },
  listBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 18 },
  listItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  listItemInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#E50914', borderColor: '#E50914' },
  listTitle: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  listTitleHidden: { color: 'rgba(255,255,255,0.3)', textDecorationLine: 'line-through' },
  listMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
});
