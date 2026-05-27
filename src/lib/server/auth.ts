/**
 * Auth helpers — thin wrappers around the Supabase server client.
 * Use createSupabaseServerClient() for per-request clients in hooks/routes.
 */
export { createSupabaseServerClient, createSupabaseAdminClient } from './supabase';
