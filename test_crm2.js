const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vnysbpnggnplvgkfokin.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''; // we can try the anon key

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: tenants } = await supabase.from('tenants').select('id').limit(1);
  if (!tenants || tenants.length === 0) {
     console.log("No tenants");
     return;
  }
  const tid = tenants[0].id;
  console.log("Invoking for tenant:", tid);
  
  const { data, error } = await supabase.functions.invoke('crm-sync-properties', {
    body: { tenant_id: tid }
  });
  console.log("Response data:", data);
  console.log("Response error:", error);
}
run();
