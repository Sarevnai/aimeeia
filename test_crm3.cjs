const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
let supabaseKey = '';
let supabaseUrl = 'https://vnysbpnggnplvgkfokin.supabase.co';

envFile.split('\n').forEach(line => {
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
        supabaseKey = line.split('=')[1].replace(/['"]/g, '').trim();
    }
    if (line.startsWith('VITE_SUPABASE_URL=')) {
        supabaseUrl = line.split('=')[1].replace(/['"]/g, '').trim();
    }
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: tenants } = await supabase.from('tenants').select('id, company_name, crm_type');
    if (!tenants || tenants.length === 0) {
        console.log("No tenants");
        return;
    }

    for (const tenant of tenants) {
        console.log(`\nInvoking for tenant: ${tenant.company_name} (${tenant.id})`);
        try {
            const response = await fetch(`${supabaseUrl}/functions/v1/crm-sync-properties`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tenant_id: tenant.id })
            });
            console.log("Status:", response.status);
            const text = await response.text();
            console.log("Response data:", text);
        } catch (e) {
            console.error("HTTP error:", e.message);
        }
    }
}
run();
