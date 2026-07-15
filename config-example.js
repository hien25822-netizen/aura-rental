/**
 * ============================================================
 * AURA RENTAL — Configuration Template
 * ============================================================
 *
 * HOW TO USE:
 * 1. Copy this file to config.js
 * 2. Replace the placeholder values with your Supabase credentials
 * 3. config.js is ignored by git (already in .gitignore)
 *
 * FIND YOUR CREDENTIALS:
 * 1. Go to https://supabase.com
 * 2. Open your project dashboard
 * 3. Go to Settings > API
 * 4. Copy "Project URL" and "anon/public" key
 */

// ============================================================
// SUPABASE CONFIGURATION
// ============================================================

window.APP_CONFIG = {
  // Your Supabase Project URL
  // Format: https://xxxxxxxxxxxx.supabase.co
  supabaseUrl: 'https://xxxxx.supabase.co',

  // Your Supabase anon/public key
  // Found in: Settings > API > Project API keys > anon/public
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx'

  // Optional: Custom redirect URL for auth
  // redirectTo: window.location.origin
};

// ============================================================
// DEMO MODE (remove/comment out window.APP_CONFIG to use)
//
// If window.APP_CONFIG is not set or missing supabaseUrl,
// the app will run in "Demo Mode" using only localStorage.
// This is useful for testing without setting up Supabase.
// ============================================================
