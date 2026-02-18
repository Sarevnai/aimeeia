// ========== AIMEE.iA v2 - AI CALL ==========
// Unified LLM gateway via Lovable AI gateway.
// Supports function calling (tools).

import { ConversationMessage } from './types.ts';

export interface LLMResponse {
  content: string;
  toolCalls: any[];
}

export async function callLLM(
  systemPrompt: string,
  conversationHistory: ConversationMessage[],
  userMessage: string,
  tools: any[] = [],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<LLMResponse> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];

  const body: any = {
    model: options.model || 'google/gemini-3-flash-preview',
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 500,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  if (!choice) throw new Error('No response from LLM');

  return {
    content: choice.message.content || '',
    toolCalls: choice.message.tool_calls || [],
  };
}

/**
 * Execute a tool call and return the result as a follow-up message.
 * The caller provides the tool executor function.
 */
export async function callLLMWithToolExecution(
  systemPrompt: string,
  conversationHistory: ConversationMessage[],
  userMessage: string,
  tools: any[],
  toolExecutor: (name: string, args: any) => Promise<string>,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    maxIterations?: number;
  } = {}
): Promise<string> {
  const maxIterations = options.maxIterations ?? 3;
  let messages = [
    { role: 'system' as const, content: systemPrompt },
    ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage }
  ];

  for (let i = 0; i < maxIterations; i++) {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');

    const body: any = {
      model: options.model || 'google/gemini-3-flash-preview',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 500,
      tools,
      tool_choice: 'auto',
    };

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No response from LLM');

    const assistantMessage = choice.message;

    // If no tool calls, return the text content
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return assistantMessage.content || '';
    }

    // Execute tool calls
    messages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      console.log(`🔧 Tool call: ${toolCall.function.name}`, args);

      try {
        const result = await toolExecutor(toolCall.function.name, args);
        messages.push({
          role: 'tool' as any,
          content: result,
          tool_call_id: toolCall.id,
        } as any);
      } catch (e) {
        messages.push({
          role: 'tool' as any,
          content: `Error: ${(e as Error).message}`,
          tool_call_id: toolCall.id,
        } as any);
      }
    }
  }

  // If we exhausted iterations, get a final response without tools
  const finalBody: any = {
    model: options.model || 'google/gemini-3-flash-preview',
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 500,
  };

  const apiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const finalResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(finalBody),
  });

  const finalData = await finalResp.json();
  return finalData.choices?.[0]?.message?.content || 'Desculpe, tive um problema ao processar sua solicitação.';
}
