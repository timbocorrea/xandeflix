-- =========================================================
-- CONFIGURAÇÃO DO BANCO DE DADOS (XANDEFLIX) NO SUPABASE
-- Execute este script no "SQL Editor" do seu painel Supabase
-- =========================================================

-- Criando a Tabela de Usuários para substituir o users.json provisório 
CREATE TABLE IF NOT EXISTS public.xandeflix_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, 
    name TEXT NOT NULL,
    playlist_url TEXT,
    is_blocked BOOLEAN DEFAULT false,
    last_access TIMESTAMP WITH TIME ZONE,
    role TEXT DEFAULT 'user', -- 'user' ou 'admin'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserindo Usuário Administrador Padrão
-- Lembre-se de trocar a senha após o primeiro acesso
INSERT INTO public.xandeflix_users (username, password, name, role)
VALUES ('admin', 'admin123', 'Administrador Xandeflix', 'admin')
ON CONFLICT (username) DO NOTHING;


-- Tabela para Salvar Progresso de Vídeo ("Continue Assistindo") nas Nuvens
CREATE TABLE IF NOT EXISTS public.playback_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.xandeflix_users(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL,
    playback_time NUMERIC NOT NULL,
    duration NUMERIC NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, media_id) 
);

-- Habilitar conexões abertas pela nossa aplicação (Desbloqueando Firewalls Padrões)
ALTER TABLE public.xandeflix_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissao Total User" ON public.xandeflix_users FOR ALL USING (true);

ALTER TABLE public.playback_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissao Total Progress" ON public.playback_progress FOR ALL USING (true);
