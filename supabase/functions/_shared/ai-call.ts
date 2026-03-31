// ========== AIMEE.iA - AI CALL v4 ==========
// Multi-provider LLM gateway with structured tracing.
// Supports: OpenAI, Anthropic, Google Gemini + Tool Calling.
// Falls back to env-level OPENAI_API_KEY if no tenant key is provided.

import { ConversationMessage } from './types.ts';

export interface LLMResponse {
  content: string;
  toolCalls: any[];
}

// ─────────────────────────────────────────────
// Trace data returned alongside LLM responses
// ─────────────────────────────────────────────

export interface TraceData {
  model: string;
  provider: string;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  tool_calls_count: number;
  tool_names: string[];
  iterations: number;
  success: boolean;
  error_message?: string;
}

export interface LLMResultWithTrace {
  content: string;
  trace: TraceData;
}

// Cost per token (USD) by model — chars/4 estimation
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gemini-2.5-pro':    { input: 1.25 / 1_000_000, output: 10.0 / 1_000_000 },
  'gemini-2.5-flash':  { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'claude-sonnet-4-6': { input: 3.0 / 1_000_000,  output: 15.0 / 1_000_000 },
  'claude-sonnet-4-5-20250514': { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  'gpt-4o':            { input: 2.5 / 1_000_000,  output: 10.0 / 1_000_000 },
  'gpt-4o-mini':       { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gpt-5.4-mini':      { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gemini-embedding-001': { input: 0.0, output: 0.0 },
};

export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const normalizedModel = model.replace(/^google\//, '');
  const costs = MODEL_COSTS[normalizedModel];
  if (!costs) return 0;
  return promptTokens * costs.input + completionTokens * costs.output;
}

// ─────────────────────────────────────────────
// Provider routing helpers
// ─────────────────────────────────────────────

type Provider = 'openai' | 'anthropic' | 'google' | 'lovable';

function detectProvider(model: string, explicitProvider?: string): Provider {
  if (explicitProvider) return explicitProvider as Provider;
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gemini') || model.startsWith('google/')) return 'google';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  // Fallback to openai-compatible endpoint
  return 'openai';
}

function resolveApiKey(provider: Provider, tenantApiKey?: string): string {
  // Tenant-supplied key takes priority
  if (tenantApiKey) return tenantApiKey;

  // Fall back to global env secrets
  switch (provider) {
    case 'anthropic':
      return Deno.env.get('ANTHROPIC_API_KEY') || Deno.env.get('OPENAI_API_KEY') || '';
    case 'google':
      return Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GEMINI_API_KEY') || '';
    case 'lovable':
      return Deno.env.get('LOVABLE_API_KEY') || '';
    default: // openai
      return Deno.env.get('OPENAI_API_KEY') || Deno.env.get('LOVABLE_API_KEY') || '';
  }
}

// ─────────────────────────────────────────────
// OpenAI-compatible call (OpenAI, Lovable gateway)
// ─────────────────────────────────────────────

async function callOpenAI(
  endpoint: string,
  apiKey: string,
  body: any
): Promise<any> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${error}`);
  }
  return response.json();
}

// ─────────────────────────────────────────────
// Anthropic call
// ─────────────────────────────────────────────

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: any[],
  tools: any[],
  maxTokens: number,
  temperature: number,
): Promise<{ content: string; toolCalls: any[] }> {
  // Convert OpenAI message format to Anthropic format
  const anthropicMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }]
        };
      }
      if (m.tool_calls) {
        return {
          role: 'assistant',
          content: m.tool_calls.map((tc: any) => ({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          }))
        };
      }
      return { role: m.role, content: m.content };
    });

  // Convert OpenAI tools to Anthropic tools format
  const anthropicTools = tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  const body: any = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: anthropicMessages,
  };

  if (anthropicTools.length > 0) {
    body.tools = anthropicTools;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${error}`);
  }

  const data = await response.json();

  // Extract text and tool calls from Anthropic response
  const textContent = data.content?.find((c: any) => c.type === 'text')?.text || '';
  const toolCalls = (data.content || [])
    .filter((c: any) => c.type === 'tool_use')
    .map((c: any) => ({
      id: c.id,
      type: 'function',
      function: {
        name: c.name,
        arguments: JSON.stringify(c.input),
      }
    }));

  return { content: textContent, toolCalls };
}

// ─────────────────────────────────────────────
// Google Gemini call (via REST API)
// ─────────────────────────────────────────────

async function callGoogle(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: any[],
  tools: any[],
  maxTokens: number,
): Promise<{ content: string; toolCalls: any[] }> {
  // Normalize model name (strip google/ prefix if present)
  const modelName = model.replace(/^google\//, '');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  // Convert to Gemini format
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || JSON.stringify(m.tool_calls || '') }],
    }));

  // Convert OpenAI tools to Gemini function declarations
  const functionDeclarations = tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));

  const body: any = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };

  if (functionDeclarations.length > 0) {
    body.tools = [{ function_declarations: functionDeclarations }];
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  const text = parts.find((p: any) => p.text)?.text || '';
  const functionCalls = parts
    .filter((p: any) => p.functionCall)
    .map((p: any, i: number) => ({
      id: `call_gemini_${i}`,
      type: 'function',
      function: {
        name: p.functionCall.name,
        arguments: JSON.stringify(p.functionCall.args),
      }
    }));

  return { content: text, toolCalls: functionCalls };
}

// ─────────────────────────────────────────────
// Unified call — routes to the correct provider
// ─────────────────────────────────────────────

async function callProviderOnce(
  provider: Provider,
  apiKey: string,
  model: string,
  messages: any[],
  tools: any[],
  options: { temperature?: number; maxTokens?: number },
): Promise<{ content: string; toolCalls: any[] }> {
  const systemMessage = messages.find(m => m.role === 'system');
  const systemPrompt = systemMessage?.content || '';
  const nonSystemMessages = messages.filter(m => m.role !== 'system');

  switch (provider) {
    case 'anthropic':
      return callAnthropic(apiKey, model, systemPrompt, messages, tools, options.maxTokens ?? 500, options.temperature ?? 0.7);

    case 'google':
      return callGoogle(apiKey, model, systemPrompt, nonSystemMessages, tools, options.maxTokens ?? 500);

    case 'lovable': {
      const lovableBody: any = {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 500,
      };
      if (tools.length > 0) { lovableBody.tools = tools; lovableBody.tool_choice = 'auto'; }
      const data = await callOpenAI('https://ai.gateway.lovable.dev/v1/chat/completions', apiKey, lovableBody);
      const choice = data.choices?.[0];
      return {
        content: choice?.message?.content || '',
        toolCalls: choice?.message?.tool_calls || [],
      };
    }

    default: { // openai
      const openaiBody: any = {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 500,
      };
      if (tools.length > 0) { openaiBody.tools = tools; openaiBody.tool_choice = 'auto'; }
      const data = await callOpenAI('https://api.openai.com/v1/chat/completions', apiKey, openaiBody);
      const choice = data.choices?.[0];
      return {
        content: choice?.message?.content || '',
        toolCalls: choice?.message?.tool_calls || [],
      };
    }
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface LLMCallOptions {
  model?: string;
  provider?: string;
  apiKey?: string;    // Tenant-specific (decrypted) API key
  temperature?: number;
  maxTokens?: number;
}

export async function callLLM(
  systemPrompt: string,
  conversationHistory: ConversationMessage[],
  userMessage: string,
  tools: any[] = [],
  options: LLMCallOptions = {}
): Promise<LLMResponse> {
  const model = options.model || 'gpt-4o-mini';
  const provider = detectProvider(model, options.provider);
  const apiKey = resolveApiKey(provider, options.apiKey);

  if (!apiKey) throw new Error(`No API key found for provider: ${provider}. Configure it in Admin > Agente Aimee.`);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];

  const result = await callProviderOnce(provider, apiKey, model, messages, tools, options);
  return result;
}

export async function callLLMWithToolExecution(
  systemPrompt: string,
  conversationHistory: ConversationMessage[],
  userMessage: string,
  tools: any[],
  toolExecutor: (name: string, args: any) => Promise<string>,
  options: LLMCallOptions & { maxIterations?: number } = {}
): Promise<LLMResultWithTrace> {
  const model = options.model || 'gpt-4o-mini';
  const provider = detectProvider(model, options.provider);
  const apiKey = resolveApiKey(provider, options.apiKey);

  if (!apiKey) throw new Error(`No API key found for provider: ${provider}. Configure it in Admin > Agente Aimee.`);

  const startTime = Date.now();
  const toolNamesSet = new Set<string>();
  let toolCallsTotal = 0;
  let iterationsCount = 0;
  let errorMessage: string | undefined;

  const maxIterations = options.maxIterations ?? 3;
  let messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage }
  ];

  // Estimate prompt tokens from initial messages
  const promptChars = messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
  const promptTokens = estimateTokens(new Array(promptChars).fill('x').join(''));

  let finalContent = '';

  try {
    for (let i = 0; i < maxIterations; i++) {
      iterationsCount++;
      const result = await callProviderOnce(provider, apiKey, model, messages, tools, options);

      // No tool calls → done
      if (!result.toolCalls || result.toolCalls.length === 0) {
        finalContent = result.content || '';
        break;
      }

      // Track tool calls
      for (const tc of result.toolCalls) {
        toolNamesSet.add(tc.function.name);
        toolCallsTotal++;
      }

      // Append assistant message with tool calls (OpenAI format for state tracking)
      messages.push({
        role: 'assistant',
        content: result.content || null,
        tool_calls: result.toolCalls,
      });

      // Execute each tool call
      for (const toolCall of result.toolCalls) {
        const args = JSON.parse(toolCall.function.arguments);
        console.log(`🔧 Tool call: ${toolCall.function.name}`, args);

        try {
          const toolResult = await toolExecutor(toolCall.function.name, args);
          messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
          });
        } catch (e) {
          messages.push({
            role: 'tool',
            content: `Error: ${(e as Error).message}`,
            tool_call_id: toolCall.id,
          });
        }
      }

      // C5 bypass: if any tool returned a SISTEMA CRÍTICA instruction (property cards already sent),
      // extract the example phrase and return directly — do NOT make another LLM call that may list properties.
      const sistemaMsg = messages
        .filter((m: any) => m.role === 'tool')
        .map((m: any) => m.content as string)
        .find((c: string) => typeof c === 'string' && c.startsWith('[SISTEMA — INSTRUÇÃO CRÍTICA]'));

      if (sistemaMsg) {
        // Fix I2: Instead of hardcoded fallback, extract contextual data from the SISTEMA message
        // to generate a property-aware response. Falls back to generic only if extraction fails.
        const exampleMatch = sistemaMsg.match(/Exemplo:\s*"([^"]+)"/);
        if (exampleMatch) {
          finalContent = exampleMatch[1];
        } else {
          // Try to extract bairro and tipo from the message for a contextual fallback
          const bairroMatch = sistemaMsg.match(/Bairro(?:\s+desejado)?:\s*([^,\n]+)/i);
          const tipoMatch = sistemaMsg.match(/Tipo:\s*([^,\n]+)/i);
          const bairro = bairroMatch?.[1]?.trim();
          const tipo = tipoMatch?.[1]?.trim()?.toLowerCase();

          if (bairro && tipo) {
            finalContent = `Encontrei ${tipo === 'apartamentos' || tipo === 'apartamento' ? 'um apartamento' : tipo === 'casas' || tipo === 'casa' ? 'uma casa' : 'uma opção'} no ${bairro} que pode te interessar. Me conta o que achou.`;
          } else if (bairro) {
            finalContent = `Separei uma opção no ${bairro} pra você. Me conta o que achou.`;
          } else {
            finalContent = `Encontrei uma opção que combina com o que você descreveu. Me conta o que achou.`;
          }
        }
        break;
      }

      // If last iteration, do final call without tools
      if (i === maxIterations - 1) {
        const finalResult = await callProviderOnce(provider, apiKey, model, messages, [], options);
        finalContent = finalResult.content || 'Desculpe, tive um problema ao processar sua solicitação.';
      }
    }
  } catch (e) {
    errorMessage = (e as Error).message;
    finalContent = finalContent || 'Desculpe, tive um problema ao processar sua solicitação.';
  }

  const latencyMs = Date.now() - startTime;
  const completionTokens = estimateTokens(finalContent);
  const costUsd = estimateCost(model, promptTokens, completionTokens);

  const trace: TraceData = {
    model,
    provider,
    latency_ms: latencyMs,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    cost_usd: costUsd,
    tool_calls_count: toolCallsTotal,
    tool_names: Array.from(toolNamesSet),
    iterations: iterationsCount,
    success: !errorMessage,
    error_message: errorMessage,
  };

  console.log(`📊 Trace: ${model} | ${latencyMs}ms | ~${trace.total_tokens} tokens | $${costUsd.toFixed(6)} | tools: ${trace.tool_names.join(',') || 'none'}`);

  return { content: finalContent, trace };
}

// ─────────────────────────────────────────────
// Fire-and-forget trace insertion for any AI call
// ─────────────────────────────────────────────

export interface InsertTraceData {
  tenant_id?: string | null;
  conversation_id?: string | null;
  call_type: string;
  agent_type?: string;
  model: string;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  cost_usd: number;
  success: boolean;
  error_message?: string | null;
  tool_calls_count?: number;
  tool_names?: string[];
  iterations?: number;
}

export function insertTrace(supabase: any, data: InsertTraceData): void {
  supabase.from('ai_traces').insert({
    tenant_id: data.tenant_id || null,
    conversation_id: data.conversation_id || null,
    call_type: data.call_type,
    agent_type: data.agent_type || null,
    model: data.model,
    provider: data.provider,
    prompt_tokens: data.prompt_tokens,
    completion_tokens: data.completion_tokens,
    total_tokens: data.prompt_tokens + data.completion_tokens,
    latency_ms: data.latency_ms,
    cost_usd: data.cost_usd,
    tool_calls_count: data.tool_calls_count ?? 0,
    tool_names: data.tool_names ?? [],
    iterations: data.iterations ?? 1,
    success: data.success,
    error_message: data.error_message || null,
  }).then(({ error }: any) => {
    if (error) console.error('⚠️ Trace insert error:', error.message);
  });
}
