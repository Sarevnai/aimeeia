import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY; // Using anon/publishable key first

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
    console.log("Checking database state...");

    // 1. Check if we have any active tenants
    const { data: tenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, company_name, is_active')
        .eq('is_active', true)
        ;

    if (tenantsError) {
        console.error("Error fetching tenants (might be RLS):", tenantsError.message);
    } else {
        console.log(`Found ${tenants?.length || 0} active tenants:`, tenants);
    }

    // 2. We can't query auth.users with the anon key, but we can try to query profiles
    // We don't know the exact user ID, so let's try to fetch all profiles limit 5
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .limit(5);

    if (profilesError) {
        console.error("Error fetching profiles (RLS likely blocking if anon):", profilesError.message);
    } else {
        console.log(`Successfully fetched profiles (anon key):`, profiles);
    }
}

checkDatabase().catch(console.error);
