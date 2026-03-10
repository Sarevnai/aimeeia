#!/usr/bin/env node
/**
 * Cria distribution rules no C2S para os plantões Villa Maggiore (Março 2026)
 *
 * Uso:
 *   node create_villa_maggiore_queues.cjs --dry-run     # Mostra regras sem criar
 *   node create_villa_maggiore_queues.cjs               # Cria todas as regras
 *   node create_villa_maggiore_queues.cjs --date 09/03/2026  # Só um dia
 */

const TOKEN = "b97697346d07158456f651f331b5e31cb176da64bf234ddf21";
const BASE_URL = "https://api.contact2sale.com/integration";
const COMPANY_ID = "a1b80677525404dd529db9cc293daf0d";

// ─── Equipes ────────────────────────────────────────────────────────────────

const EQUIPE_GAIA = [
  { id: "eefc94c33ad38c5d9c6662f8d8355c71", name: "Lana Arantes Silva" },
  { id: "7d08471b1942ca6090d50208d97e6cfb",  name: "Marcia Arantes" },
  { id: "53eec4b81c98be93a11e17c7306bc78b",  name: "Cristina" },
  { id: "8ee39ecd1226b3d7d11a6aa276a2381f",  name: "Eduardo Morgado" },
];

const EQUIPE_AGUIA = [
  { id: "fc6a0031daade65bb2f47f6898a7e3ed",  name: "Ana Carolina" },
  { id: "064f3e73dc456a16c975f3a4c6564688",  name: "Carlos Frederico Leal de Souza" },
  { id: "ffcaf79b6e96003b6c2ad804f3798218",  name: "João Victor" },
  { id: "9f778e3a5ea6f262d9d0c549367add20",  name: "Léa Leal de Souza da Luz" },
  { id: "b57be76333f35da2243a764d361167da",  name: "Romario" },
  { id: "a5b5a2f7f01c16d3dea715c5e96c0128",  name: "Thiago Netto Campos" },
];

// ─── Escala SMOLKA (a partir de 09/03/2026) ────────────────────────────────

const SMOLKA_DAYS = [
  { date: "09/03/2026", teamName: "Equipe Gaia",  sellers: EQUIPE_GAIA },
  { date: "12/03/2026", teamName: "Equipe Águia", sellers: EQUIPE_AGUIA },
  { date: "15/03/2026", teamName: "Equipe Gaia",  sellers: EQUIPE_GAIA },
  { date: "18/03/2026", teamName: "Equipe Águia", sellers: EQUIPE_AGUIA },
  { date: "21/03/2026", teamName: "Equipe Gaia",  sellers: EQUIPE_GAIA },
  { date: "24/03/2026", teamName: "Equipe Águia", sellers: EQUIPE_AGUIA },
  { date: "27/03/2026", teamName: "Equipe Gaia",  sellers: EQUIPE_GAIA },
  { date: "30/03/2026", teamName: "Equipe Águia", sellers: EQUIPE_AGUIA },
];

// ─── Canais de origem ───────────────────────────────────────────────────────
// Leads chegando com source = "villa-maggiore-meta_ads" (ou google_ads / landing_page)
// serão roteados para os sellers desta fila via distribution rules

const SOURCES = ["meta_ads", "google_ads", "landing_page"];

// ─── Funções ────────────────────────────────────────────────────────────────

async function postRule(rule) {
  const res = await fetch(`${BASE_URL}/distribution_rules`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(rule),
  });
  return res.json();
}

async function createDayRules(day, dryRun) {
  const queueName = `Plantão Villa Maggiore - ${day.teamName} - ${day.date}`;
  const dateCod = day.date.replace(/\//g, "-");

  console.log(`\n📋 ${queueName}`);
  console.log(`   Corretores: ${day.sellers.map(s => s.name).join(", ")}`);

  let ok = 0;
  let fail = 0;

  for (const source of SOURCES) {
    const cod2 = `villa-maggiore-${source}`;

    for (let i = 0; i < day.sellers.length; i++) {
      const seller = day.sellers[i];
      const rule = {
        cod_1: "Lançamento",
        cod_2: cod2,
        cod_3: dateCod,
        priority: i + 1,
        type_rule: "distribution",
        seller_id: seller.id,
        company_id: COMPANY_ID,
      };

      if (dryRun) {
        console.log(`   [DRY] source=${source} priority=${i+1} seller="${seller.name}"`);
        ok++;
        continue;
      }

      const result = await postRule(rule);
      if (result && result.success !== false) {
        ok++;
        if (i === 0) {
          // Só loga o primeiro seller por source para não poluir
          console.log(`   ✅ source=${source} → ${day.sellers.length} corretores`);
        }
      } else {
        fail++;
        console.log(`   ❌ source=${source} seller="${seller.name}" →`, JSON.stringify(result));
      }
    }
  }

  console.log(`   ${dryRun ? "📝" : (fail === 0 ? "✅" : "⚠️")} ${ok} regras ${dryRun ? "simuladas" : "criadas"}${fail > 0 ? `, ${fail} falhas` : ""}`);
  return { ok, fail };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dateFilter = (() => {
    const idx = args.indexOf("--date");
    return idx >= 0 ? args[idx + 1] : null;
  })();

  const days = dateFilter
    ? SMOLKA_DAYS.filter(d => d.date === dateFilter)
    : SMOLKA_DAYS;

  if (dateFilter && days.length === 0) {
    console.error(`❌ Data "${dateFilter}" não encontrada na escala. Datas disponíveis:`);
    SMOLKA_DAYS.forEach(d => console.error(`   ${d.date} - ${d.teamName}`));
    process.exit(1);
  }

  console.log(`\n🏠 Villa Maggiore — Criação de Filas de Plantão C2S`);
  console.log(`   Modo: ${dryRun ? "DRY RUN (sem chamadas reais)" : "EXECUÇÃO REAL"}`);
  console.log(`   Dias: ${days.length} plantão(ões) SMOLKA`);

  let totalOk = 0;
  let totalFail = 0;

  for (const day of days) {
    const { ok, fail } = await createDayRules(day, dryRun);
    totalOk += ok;
    totalFail += fail;
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Total: ${totalOk} regras ${dryRun ? "simuladas" : "criadas"} | ${totalFail} falhas`);

  if (!dryRun && totalOk > 0) {
    console.log(`\n📌 Como enviar leads para essas filas:`);
    console.log(`   Inclua no POST /integration/leads:`);
    console.log(`   "source": "villa-maggiore-meta_ads" (ou google_ads / landing_page)`);
    console.log(`   "type_negotiation": "Lançamento"`);
    console.log(`   "description": "Villa Maggiore"`);
    console.log(`\n   Exemplo de tags recomendadas por dia:`);
    days.forEach(d => {
      const tag = d.teamName.toLowerCase().replace(" ", "-").replace("á", "a").replace("â", "a");
      console.log(`   ${d.date}: ["villa-maggiore", "${tag}", "${d.date.replace(/\//g, "-")}"]`);
    });
  }
}

main().catch(err => {
  console.error("Erro:", err.message);
  process.exit(1);
});
