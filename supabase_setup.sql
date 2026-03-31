-- =========================================================
-- CONFIGURACAO DO BANCO DE DADOS (XANDEFLIX) NO SUPABASE
-- Execute este script no "SQL Editor" do seu painel Supabase
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Criando a Tabela de Usuarios para substituir o users.json provisório
CREATE TABLE IF NOT EXISTS public.xandeflix_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    playlist_url TEXT,
    is_blocked BOOLEAN DEFAULT false,
    last_access TIMESTAMP WITH TIME ZONE,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    hidden_categories JSONB DEFAULT '[]'::jsonb,
    category_overrides JSONB DEFAULT '{}'::jsonb,
    media_overrides JSONB DEFAULT '{}'::jsonb
);

-- Inserindo usuario administrador padrao com hash bcrypt compativel.
-- Lembre-se de trocar a senha apos o primeiro acesso.
INSERT INTO public.xandeflix_users (username, password, name, role)
VALUES (
    'admin',
    crypt('admin123', gen_salt('bf', 10)),
    'Administrador Xandeflix',
    'admin'
)
ON CONFLICT (username) DO UPDATE
SET
    password = CASE
        WHEN public.xandeflix_users.password ~ '^\$2[aby]\$' THEN public.xandeflix_users.password
        ELSE EXCLUDED.password
    END,
    name = EXCLUDED.name,
    role = EXCLUDED.role;

-- Tabela para salvar progresso de video ("Continue Assistindo") na nuvem
CREATE TABLE IF NOT EXISTS public.playback_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.xandeflix_users(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL,
    playback_time NUMERIC NOT NULL,
    duration NUMERIC NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, media_id)
);

-- Habilitar Seguranca em Nivel de Linha (RLS)
ALTER TABLE public.xandeflix_users ENABLE ROW LEVEL SECURITY;

-- Politica: usuarios so veem seus proprios dados de perfil
DROP POLICY IF EXISTS "User Profile Access" ON public.xandeflix_users;
CREATE POLICY "User Profile Access" ON public.xandeflix_users
FOR SELECT
USING (auth.uid() = id);

-- Politica: administradores tem acesso total (exemplo opcional)
-- DROP POLICY IF EXISTS "Admin Full Access" ON public.xandeflix_users;
-- CREATE POLICY "Admin Full Access" ON public.xandeflix_users FOR ALL USING (role = 'admin');

ALTER TABLE public.playback_progress ENABLE ROW LEVEL SECURITY;

-- Politica: usuarios so gerenciam seu proprio progresso de video
DROP POLICY IF EXISTS "User Progress Ownership" ON public.playback_progress;
CREATE POLICY "User Progress Ownership" ON public.playback_progress
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
