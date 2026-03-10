const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
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
}

if (!supabaseKey) {
    supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const supabase = createClient(supabaseUrl, supabaseKey || "dummy");

async function run() {
    const { data, error } = await supabase.from('tenants').select('id, company_name, crm_type, crm_api_key, crm_api_url');
    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log("All Tenants:", JSON.stringify(data, null, 2));
    }
}
run();
