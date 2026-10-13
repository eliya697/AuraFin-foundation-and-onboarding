import { isSupabaseConfigured } from './supabaseClient.js';
import { supabaseRepository } from './supabaseRepository.js';
import { localRepository } from './localRepository.js';

/**
 * Both implementations expose the same async interface:
 * ensureUser, getAccessToken, loadProfile, saveProfile, listTransactions,
 * addTransactions, deleteSampleTransactions, saveInsight, resetAll.
 */
export const repository = isSupabaseConfigured ? supabaseRepository : localRepository;
