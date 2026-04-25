// ========== AIMEE.iA - CREATE USERS FROM BROKERS ==========
// For each broker that exists in BOTH Vista (vista_codigo != null) AND C2S (real c2s_seller_id)
// with a valid email, create an auth user + profile, then link brokers.profile_id.
//
// Idempotent: if user already exists (by email), only links the profile_id.
// Role defaults to 'operator'. Email is pre-confirmed (corretor will use "reset password" on first login).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

// Generic / non-personal emails to skip
const EMAIL_BLOCKLIST = new Set([
  'adm@smolkaimoveis.com.br',
]);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, dry_run = false, role = 'operator', department_code = 'vendas', include_active_without_vista = false } = await req.json().catch(() => ({}));
    if (!tenant_id) return errorResponse('Missing tenant_id', 400);

    // Eligible brokers: email + C2S real seller (not vista-only placeholder).
    // Default: também exige vista_codigo (perfil "completo" Vista+C2S).
    // Com include_active_without_vista=true: aceita active+sem profile_id mesmo sem Vista
    // (caso de corretores ativos no C2S que ainda não foram cadastrados no Vista).
    let q = supabase
      .from('brokers')
      .select('id, full_name, email, phone, c2s_seller_id, c2s_is_master, vista_codigo, profile_id, active')
      .eq('tenant_id', tenant_id)
      .not('email', 'is', null)
      .not('c2s_seller_id', 'like', 'vista-only:%');
    if (!include_active_without_vista) {
      q = q.not('vista_codigo', 'is', null);
    } else {
      q = q.eq('active', true);
    }
    const { data: brokers, error: bErr } = await q;
    if (bErr) throw new Error(`Query brokers failed: ${bErr.message}`);

    // Dedup by email: prefer c2s_is_master=true
    const byEmail = new Map<string, typeof brokers[number]>();
    for (const b of brokers || []) {
      const key = (b.email || '').trim().toLowerCase();
      if (!key || EMAIL_BLOCKLIST.has(key)) continue;
      const existing = byEmail.get(key);
      if (!existing || (b.c2s_is_master && !existing.c2s_is_master)) {
        byEmail.set(key, b);
      }
    }

    const candidates = Array.from(byEmail.values());

    // Preload ALL auth users once (cheaper than per-candidate lookup). For ~50 users it's negligible.
    const authByEmail = new Map<string, { id: string }>();
    {
      let page = 1;
      while (true) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(`listUsers: ${error.message}`);
        for (const u of data?.users || []) {
          if (u.email) authByEmail.set(u.email.toLowerCase(), { id: u.id });
        }
        if (!data || (data.users || []).length < 200) break;
        page++;
        if (page > 20) break;
      }
    }

    const stats = {
      eligible: candidates.length,
      auth_users_indexed: authByEmail.size,
      created_user: 0,
      linked_existing: 0,
      already_linked: 0,
      errors: 0,
      results: [] as any[],
    };

    for (const b of candidates) {
      try {
        const email = b.email!.trim().toLowerCase();

        if (b.profile_id && !dry_run) {
          stats.already_linked++;
          stats.results.push({ email, action: 'already_linked', profile_id: b.profile_id });
          continue;
        }

        let userId: string | null = authByEmail.get(email)?.id || null;

        let createdNow = false;
        if (!userId) {
          if (dry_run) {
            stats.results.push({ email, action: 'would_create', name: b.full_name });
            continue;
          }
          const password = generatePassword();
          const { data: created, error: createErr } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              tenant_id,
              full_name: b.full_name,
              role,
              department_code,
            },
          });
          if (createErr) throw new Error(`createUser: ${createErr.message}`);
          userId = created.user?.id || null;
          createdNow = true;
        }

        if (!userId) throw new Error('Could not resolve user_id');

        // Ensure profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        let profileId = profile?.id as string | undefined;

        if (!profileId) {
          if (dry_run) {
            stats.results.push({ email, action: 'would_create_profile', user_id: userId });
            continue;
          }
          const { data: newProfile, error: pErr } = await supabase
            .from('profiles')
            .upsert({
              id: userId,
              user_id: userId,
              tenant_id,
              full_name: b.full_name,
              role,
              department_code,
            }, { onConflict: 'id' })
            .select('id')
            .single();
          if (pErr) throw new Error(`Upsert profile: ${pErr.message}`);
          profileId = newProfile.id;
        } else if (!dry_run) {
          await supabase
            .from('profiles')
            .update({ tenant_id, full_name: b.full_name, user_id: userId, role, department_code })
            .eq('id', profileId);
        }

        if (!dry_run) {
          await supabase
            .from('brokers')
            .update({ profile_id: profileId })
            .eq('id', b.id);
        }

        if (createdNow) stats.created_user++;
        else stats.linked_existing++;

        stats.results.push({
          email,
          name: b.full_name,
          user_id: userId,
          profile_id: profileId,
          action: createdNow ? 'created' : 'linked_existing',
        });

      } catch (err) {
        stats.errors++;
        stats.results.push({ email: b.email, error: (err as Error).message });
        console.error('Broker user create error:', b.email, err);
      }
    }

    return jsonResponse({
      success: true,
      dry_run,
      ...stats,
    });

  } catch (error) {
    console.error('❌ brokers-create-users error:', error);
    return errorResponse((error as Error).message);
  }
});

function generatePassword(): string {
  // 16 chars, includes upper, lower, digit, symbol
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digit = '23456789';
  const symbol = '!@#$%&*';
  const all = lower + upper + digit + symbol;
  let out = '';
  // guarantee one of each
  out += lower[Math.floor(Math.random() * lower.length)];
  out += upper[Math.floor(Math.random() * upper.length)];
  out += digit[Math.floor(Math.random() * digit.length)];
  out += symbol[Math.floor(Math.random() * symbol.length)];
  while (out.length < 16) out += all[Math.floor(Math.random() * all.length)];
  // shuffle
  return out.split('').sort(() => Math.random() - 0.5).join('');
}
