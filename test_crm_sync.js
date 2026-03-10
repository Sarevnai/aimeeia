require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://vnysbpnggnplvgkfokin.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data, error } = await supabase.functions.invoke('crm-sync-properties', {
    body: { tenant_id: '50e4ed4e-9844-4e44-b0a3-aaeb3634c0e6' } // using an active tenant id if needed, let me just find one
  });
  console.log("Data:", data);
  console.log("Error:", error);
}

// Get the first tenant ID
async function run() {
  const { data: tenants } = await supabase.from('tenants').select('id').limit(1);
  if (tenants && tenants.length > 0) {
    const { data, error } = await supabase.functions.invoke('crm-sync-properties', {
      body: { tenant_id: tenants[0].id }
    });
    console.log("Result:", data, error);
  }
}
run();
