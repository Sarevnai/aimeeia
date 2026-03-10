const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let supabaseKey = '';
let supabaseUrl = 'https://vnysbpnggnplvgkfokin.supabase.co';

try {
    const secretsFile = fs.readFileSync('secrets.txt', 'utf8');
    secretsFile.split('\n').forEach(line => {
        if (line.includes('SUPABASE_SERVICE_ROLE_KEY')) {
            supabaseKey = line.split('|')[1].trim();
        }
    });
} catch (e) {
    // Read from .env instead as fallback
    const envFile = fs.readFileSync('.env', 'utf8');
    envFile.split('\n').forEach(line => {
        if (line.startsWith('VITE_SUPABASE_URL=')) {
            supabaseUrl = line.split('=')[1].replace(/['"]/g, '').trim();
        }
    });
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase.from('tenants').select('id, company_name, crm_type, crm_api_key, crm_api_url').limit(10);
    console.log("Tenants:", JSON.stringify(data, null, 2));
    if (error) {
        console.error("Error:", error);
    }
}
run();
