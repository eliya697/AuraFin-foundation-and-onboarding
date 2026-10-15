/**
 * The system administrator. In production the role comes from Supabase (`user_roles`, seeded from
 * `admin_emails` in supabase/migrations/0002_auth_roles_journeys.sql); this constant is used only by
 * the dev-only local backend and for labelling.
 */
export const ADMIN_EMAIL = 'eliyamistriel1234@gmail.com';

// Values are inlined by Vite at build time (from .env.production for `vite build`). Strip quotes,
// whitespace and a trailing slash, which are easy to pick up when pasting from the dashboard.
const clean = (value) => String(value ?? '').trim().replace(/^["']|["']$/g, '').trim();

export const SUPABASE_URL = clean(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

export { supabaseConfigProblem } from './supabaseConfigCheck.js';
