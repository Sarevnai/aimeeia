import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
    process.exit(1);
}

const supabase = createClient(url, key);

async function runTest() {
    const testEmail = `test_${Date.now()}@example.com`;
    const password = "testPassword123!";

    console.log(`[1] Signing up test user: ${testEmail}`);
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: testEmail,
        password: password,
        options: {
            data: {
                full_name: 'Test Setup User',
                role: 'operator',
                tenant_id: '11111111-1111-1111-1111-111111111111'
            }
        }
    });

    if (authError) {
        console.error("SignUp Error:", authError);
        return;
    }

    const userId = authData.user.id;
    console.log(`[2] User created with ID: ${userId}`);

    // Wait a second for trigger to execute if it's asynchronous (though postgres triggers are synchronous)
    await new Promise(r => setTimeout(r, 1000));

    console.log(`[3] Attempting to fetch profile for ID: ${userId} ...`);

    // Because we signed up, our supabase client should have the session for the newly created user
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role, avatar_url, tenant_id')
        .eq('id', userId)
        .single();

    if (profileError) {
        console.error("[!] Profile Fetch Error:", profileError);
        console.error("This usually means either RLS is blocking the SELECT, or the trigger failed to create the profile row.");
    } else if (!profile) {
        console.warn("[!] Profile Fetch returned null! Trigger might not be working.");
    } else {
        console.log("[4] SUCCESS! Profile fetched correctly:", profile);
    }

    console.log(`[5] Cleaning up (Signing out)...`);
    await supabase.auth.signOut();
}

runTest();
