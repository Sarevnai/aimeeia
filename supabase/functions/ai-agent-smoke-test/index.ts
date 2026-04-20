// ========== AIMEE.iA - SMOKE TEST (F5) ==========
// Runs fixed simulation scenarios and validates scores before deploy.
// Calls ai-agent-simulate for each scenario turn, then ai-agent-analyze-batch.
// Returns pass/fail per scenario + overall result.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

interface ScenarioTurn {
  message: string;
  expect_action?: string; // 'handoff' | 'search' | null
}

interface Scenario {
  name: string;
  department: string;
  turns: ScenarioTurn[];
  min_score: number;
}

// ========== FIXED TEST SCENARIOS ==========

const SCENARIOS: Scenario[] = [
  {
    name: 'Happy Path — Remarketing Completo',
    department: 'remarketing',
    min_score: 8.5,
    turns: [
      { message: 'Oi, quem é?' },
      { message: 'Ah sim, lembro. Estou procurando um apartamento para comprar.' },
      { message: 'Centro ou Agronômica, até 500 mil, 2 quartos no mínimo.' },
      { message: 'Pode buscar sim.' },
      { message: 'Gostei do segundo. Pode me passar para um corretor?', expect_action: 'handoff' },
    ],
  },
  {
    name: 'Edge Case — Múltiplos Bairros + Correção',
    department: 'remarketing',
    min_score: 8.5,
    turns: [
      { message: 'Oi' },
      { message: 'Quero alugar uma casa no Campeche ou na Lagoa.' },
      { message: 'Na verdade, prefiro comprar. Até 800 mil.' },
      { message: '3 quartos pelo menos.' },
    ],
  },
  {
    name: 'Handoff Direto — Comercial',
    department: 'vendas',
    min_score: 8.5,
    turns: [
      { message: 'Oi, vi um apartamento no site e quero mais informações.' },
      { message: 'Apartamento no Centro, venda, até 400 mil, 2 quartos.' },
      { message: 'Pode buscar.' },
      { message: 'Quero falar com um corretor por favor.', expect_action: 'handoff' },
    ],
  },

  // ========== ADMIN — Sprint 6.1 Personas ==========

  {
    // Persona: Inquilino bravo — vazamento 3 dias sem solução.
    // Valida: Aimee reconhece emoção ANTES de processar? Não espelha raiva?
    // Prioridade=urgente? Não promete prazo específico?
    name: 'Admin P1 — Inquilino Bravo (vazamento emergência)',
    department: 'administrativo',
    min_score: 8.5,
    turns: [
      { message: 'EU ME RECUSO A ESPERAR MAIS. TÁ PINGANDO ÁGUA NO MEU QUARTO HÁ 3 DIAS.' },
      { message: 'Sou inquilino. Apartamento 202 do Edifício Solar, rua XV de Novembro. Já mandei 5 mensagens essa semana.' },
      { message: 'E agora?' },
      { message: 'Meu filho tá dormindo no sofá por causa disso. Cadê o respeito aos inquilinos?' },
    ],
  },
  {
    // Persona: Proprietário ansioso — repasse atrasado, ameaça trocar imobiliária.
    // Valida: Aimee trata com deferência (proprietário)? Tom formal? Sem promessa sem lastro?
    // Demonstra ownership em vez de empurrar pro financeiro?
    name: 'Admin P2 — Proprietário Ansioso (repasse atrasado)',
    department: 'administrativo',
    min_score: 8.5,
    turns: [
      { message: 'Bom dia. Gostaria de saber por que meu repasse está atrasado esse mês.' },
      { message: 'Sou proprietário do imóvel na Rua das Flores, 45. Há 5 anos com vocês, nunca tive esse tipo de problema.' },
      { message: 'Se isso virar padrão, vou ter que reavaliar o contrato com a imobiliária.' },
      { message: 'Preciso de uma resposta ainda hoje, por favor.' },
    ],
  },
  {
    // Persona: Cliente VIP — tom formal, expectativa premium, vistoria pendente.
    // Valida: Tom formal mantido ao longo dos turnos? Aimee não familiariza demais?
    // Criou ticket de Vistoria com prioridade alta? Respondeu rápido + ownership?
    name: 'Admin P3 — Cliente VIP (vistoria pendente)',
    department: 'administrativo',
    min_score: 8.5,
    turns: [
      { message: 'Boa tarde. Aqui é Dr. Souza. Gostaria de saber o status da minha vistoria de saída.' },
      { message: 'A vistoria foi agendada para a semana passada e até agora não recebi nenhum retorno da equipe.' },
      { message: 'Preciso finalizar isso até sexta-feira. Tenho mudança agendada para sábado.' },
    ],
  },
  {
    // Persona: Primeiro aluguel — cheio de dúvidas básicas, tom acolhedor.
    // Valida: Aimee é paciente? Não sobrecarrega com info? Responde o que sabe
    // e registra o que precisa de confirmação? Linguagem humana, não jargão?
    name: 'Admin P4 — Primeiro Aluguel (múltiplas dúvidas básicas)',
    department: 'administrativo',
    min_score: 8.5,
    turns: [
      { message: 'Oi! Acabei de alugar com vocês. É tudo novo pra mim. Tenho umas perguntinhas se puder.' },
      { message: 'Sou inquilino. Quando eu pago o primeiro aluguel? É boleto ou pix?' },
      { message: 'Ah, e se eu quiser pintar a parede do quarto de uma cor diferente? Pode?' },
      { message: 'Mais uma: tem corretagem de novo se eu renovar o contrato daqui 12 meses?' },
    ],
  },
  {
    // Persona: Rescindindo irritado — ALTO RISCO absoluto. Aimee NÃO pode resolver sozinha.
    // Valida: Aimee criou ticket Rescisão E usou encaminhar_humano com motivo='categoria_alto_risco'?
    // Acolheu emoção antes de encaminhar? NUNCA discutiu multa / cláusulas contratuais?
    name: 'Admin P5 — Rescindindo Irritado (ALTO RISCO, handoff obrigatório)',
    department: 'administrativo',
    min_score: 8.5,
    turns: [
      { message: 'QUERO RESCINDIR O CONTRATO JÁ. NÃO AGUENTO MAIS.' },
      { message: 'Inquilino. Apartamento 503 do Edifício Girassol. Motivo? Vocês. Seis meses esperando uma manutenção que nunca veio.' },
      { message: 'Quero saber a multa e o que precisa pra eu sair HOJE.', expect_action: 'handoff' },
    ],
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const supabase = getSupabaseClient(req);
    const { tenant_id } = await req.json();

    if (!tenant_id) {
      return errorResponse('Missing tenant_id', 400);
    }

    const results: Array<{
      scenario: string;
      score: number | null;
      passed: boolean;
      error_count: number;
      critical_errors: number;
      details: string;
    }> = [];

    for (const scenario of SCENARIOS) {
      console.log(`\n🧪 Running scenario: ${scenario.name}`);
      let conversationId: string | null = null;
      let lastAction: string | null = null;

      try {
        // Run each turn through ai-agent-simulate
        for (let i = 0; i < scenario.turns.length; i++) {
          const turn = scenario.turns[i];
          console.log(`  Turn ${i + 1}: "${turn.message.slice(0, 50)}..."`);

          const { data: simResult, error: simError } = await supabase.functions.invoke('ai-agent-simulate', {
            body: {
              tenant_id,
              message_body: turn.message,
              department: scenario.department,
              conversation_id: conversationId,
            },
          });

          if (simError) {
            throw new Error(`Simulation error on turn ${i + 1}: ${simError.message}`);
          }

          conversationId = simResult?.conversation_id || conversationId;
          lastAction = simResult?.action || null;

          if (turn.expect_action === 'handoff' && lastAction !== 'handoff_direct' && !simResult?.handoff_detected) {
            console.warn(`  ⚠️ Expected handoff on turn ${i + 1}, got action: ${lastAction}`);
          }
        }

        // Analyze the conversation
        if (!conversationId) {
          results.push({
            scenario: scenario.name,
            score: null,
            passed: false,
            error_count: 0,
            critical_errors: 0,
            details: 'No conversation_id returned from simulation',
          });
          continue;
        }

        const { data: analysisResult, error: analysisError } = await supabase.functions.invoke('ai-agent-analyze-batch', {
          body: {
            conversation_id: conversationId,
            tenant_id,
          },
        });

        if (analysisError) {
          throw new Error(`Analysis error: ${analysisError.message}`);
        }

        const avgScore = analysisResult?.average_score ?? null;
        const errorCount = analysisResult?.total_errors ?? 0;
        const criticalErrors = analysisResult?.critical_errors ?? 0;
        const passed = avgScore !== null && avgScore >= scenario.min_score && criticalErrors === 0;

        results.push({
          scenario: scenario.name,
          score: avgScore,
          passed,
          error_count: errorCount,
          critical_errors: criticalErrors,
          details: passed
            ? `Score ${avgScore?.toFixed(1)}/10 — PASSED`
            : `Score ${avgScore?.toFixed(1) || 'N/A'}/10, ${criticalErrors} critical errors — FAILED`,
        });

        console.log(`  ${passed ? '✅' : '❌'} ${scenario.name}: ${avgScore?.toFixed(1)}/10, ${criticalErrors} critical`);

      } catch (scenarioError) {
        results.push({
          scenario: scenario.name,
          score: null,
          passed: false,
          error_count: 0,
          critical_errors: 0,
          details: `Error: ${(scenarioError as Error).message}`,
        });
        console.error(`  ❌ ${scenario.name}: ${(scenarioError as Error).message}`);
      }
    }

    const allPassed = results.every(r => r.passed);
    const totalScenarios = results.length;
    const passedCount = results.filter(r => r.passed).length;

    return jsonResponse({
      overall: allPassed ? 'PASS' : 'FAIL',
      summary: `${passedCount}/${totalScenarios} scenarios passed`,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Smoke test error:', error);
    return errorResponse((error as Error).message);
  }
});
