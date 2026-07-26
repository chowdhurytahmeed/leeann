// Supabase client + a small API layer for Lean's shared backend.
//
// Setup (after you create your Supabase project):
//   1. In your Supabase project: Settings -> API -> copy "Project URL" and
//      the "anon public" key.
//   2. Create a file named `.env` in the project root (same level as
//      package.json) with:
//        VITE_SUPABASE_URL=https://your-project.supabase.co
//        VITE_SUPABASE_ANON_KEY=your-anon-key-here
//   3. Run supabase/schema.sql once in your project's SQL Editor.
//   4. `npm install` (to pull in @supabase/supabase-js), then `npm run build`.
//
// The anon key is safe to ship in client-side code by design — it's
// meant to be public. Access control is enforced by the Row Level Security
// policies in schema.sql, not by keeping this key secret.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseReady
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

function requireClient() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured yet — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.'
    );
  }
  return supabase;
}

// ---------- accounts ----------

export async function getAccount(email) {
  const db = requireClient();
  const { data, error } = await db.from('accounts').select('*').eq('email', email).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertAccount(account) {
  const db = requireClient();
  const { data, error } = await db
    .from('accounts')
    .upsert({
      email: account.email,
      type: account.type,
      name: account.name,
      company: account.company ?? null,
      resume: account.resume ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- roles ----------

export async function getRolesForEmployer(employerEmail) {
  const db = requireClient();
  const { data, error } = await db
    .from('roles')
    .select('*')
    .eq('employer_email', employerEmail)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// Every role across the whole company, regardless of who posted it —
// joined with the poster's name/email from accounts so the company-wide
// openings view can show which hiring manager owns each role.
export async function getRolesForCompany(company) {
  const db = requireClient();
  const { data, error } = await db
    .from('roles')
    .select('*, accounts!roles_employer_email_fkey(name, email)')
    .eq('company', company)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// The public job board: every role with enough info to show a candidate.
export async function getOpenRoles() {
  const db = requireClient();
  const { data, error } = await db
    .from('roles')
    .select('*')
    .not('title', 'eq', '')
    .not('team', 'eq', '')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createRole(employerEmail, company) {
  const db = requireClient();
  const { data, error } = await db
    .from('roles')
    .insert({
      employer_email: employerEmail,
      company: company || '',
      hm_messages: [
        {
          role: 'assistant',
          text: "Hi — I'm Lean. Tell me about the role you're hiring for. Start wherever's easiest: the job title, the team, or what the person would actually be doing day to day.",
        },
      ],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRole(roleId, changes) {
  const db = requireClient();
  const { data, error } = await db.from('roles').update(changes).eq('id', roleId).select().single();
  if (error) throw error;
  return data;
}

// ---------- applications (candidates applying to roles) ----------

export async function getApplicationsForRole(roleId) {
  const db = requireClient();
  const { data, error } = await db
    .from('applications')
    .select('*')
    .eq('role_id', roleId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getApplicationsForAccount(accountEmail) {
  const db = requireClient();
  const { data, error } = await db
    .from('applications')
    .select('*')
    .eq('account_email', accountEmail)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createApplication({ roleId, accountEmail, name, resume }) {
  const db = requireClient();
  const { data, error } = await db
    .from('applications')
    .insert({
      role_id: roleId,
      account_email: accountEmail,
      name: name || '',
      resume: resume || '',
      started_at: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateApplication(applicationId, changes) {
  const db = requireClient();
  const { data, error } = await db.from('applications').update(changes).eq('id', applicationId).select().single();
  if (error) throw error;
  return data;
}

// ---------- practice history ----------

export async function getPracticeHistory(accountEmail) {
  const db = requireClient();
  const { data, error } = await db
    .from('practice_history')
    .select('*')
    .eq('account_email', accountEmail)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addPracticeReport(accountEmail, report) {
  const db = requireClient();
  const { data, error } = await db
    .from('practice_history')
    .insert({ account_email: accountEmail, report })
    .select()
    .single();
  if (error) throw error;
  return data;
}
