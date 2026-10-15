/**
 * The system administrator. In production the role comes from Supabase (`user_roles`, seeded from
 * `admin_emails` in supabase/migrations/0002_auth_roles_journeys.sql); this constant is used only by
 * the dev-only local backend and for labelling.
 */
export const ADMIN_EMAIL = 'eliyamistriel1234@gmail.com';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
