const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envs = fs.readFileSync('.env', 'utf-8').split('\n');
let supabaseUrl = '';
let supabaseKey = '';
for (const line of envs) {
  if (line.startsWith('SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) supabaseKey = line.split('=')[1].trim();
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: states, error } = await supabase
    .from('conversation_states')
    .select('phone_number, updated_at, is_ai_active, pending_properties, current_property_index')
    .order('updated_at', { ascending: false })
    .limit(3);
    
  console.log("Latest conversation states:", states);
  
  // Maybe look at conversations table or logs? 
  // Let's just try to hit the webhook to see the error.
}

run();
