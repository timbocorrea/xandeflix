import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config();

function sanitizeEnvValue(value?: string): string {
  if (!value) return '';

  return value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^(VITE_SUPABASE_URL|SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL)=/i, '')
    .replace(/^(SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY)=/i, '');
}

const supabaseUrl = sanitizeEnvValue(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const supabaseKey = sanitizeEnvValue(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
);

if (!supabaseUrl || !supabaseKey) {
  console.warn('[SUPABASE] Credenciais ausentes no backend.');
}

function createSafeSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  try {
    return createClient(supabaseUrl, supabaseKey);
  } catch (error) {
    console.error('[SUPABASE] Falha ao inicializar cliente do backend:', error);
    return null;
  }
}

export const supabase = createSafeSupabaseClient();
