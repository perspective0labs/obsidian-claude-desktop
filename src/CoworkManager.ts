import { App } from 'obsidian';
import { AnthropicClient } from './AnthropicClient';
import { getVaultTools, executeVaultTool } from './VaultTools';
import type { CoworkAgent, ContentBlock, ModelId, Tool } from './types';

export interface CoworkResult {
  agents: CoworkAgent[];
  synthesis: string;
}

export class CoworkManager {
  constructor(
    private client: AnthropicClient,
    private app: App,
    private model: ModelId,
    private maxTokens: number
  ) {}

  async runCowork(
    task: string,
    onAgentUpdate: (agent: CoworkAgent) => void,
    enableVaultTools: boolean
  ): Promise<CoworkResult> {
    const tools = enableVaultTools ? getVaultTools() : [];

    const agents: CoworkAgent[] = [
      {
        id: 'researcher',
        name: '🔍 Researcher',
        role: 'Thoroughly research the task and gather all relevant context',
        model: this.model,
        systemPrompt: [
          'You are a meticulous research agent. Your job is to thoroughly investigate the given task.',
          'Gather all relevant information, context, and details. Be comprehensive and thorough.',
          enableVaultTools ? "You have access to the user's Obsidian vault — use it to find relevant notes and context." : '',
          'Format your output as a structured research report.',
        ].filter(Boolean).join('\n'),
        status: 'idle',
      },
      {
        id: 'critic',
        name: '🧐 Critic',
        role: 'Identify gaps, challenges, and alternative perspectives',
        model: this.model,
        systemPrompt: [
          'You are a critical analyst. You receive research findings and must:',
          '1. Identify gaps and missing information',
          '2. Challenge assumptions',
          '3. Find potential issues or edge cases',
          '4. Suggest alternative perspectives',
          'Be constructively critical — your goal is to improve the final output.',
        ].join('\n'),
        status: 'idle',
      },
      {
        id: 'synthesizer',
        name: '✨ Synthesizer',
        role: 'Combine insights into a final comprehensive response',
        model: this.model,
        systemPrompt: [
          'You are a synthesis agent. Given the original task, research findings, and critique:',
          '1. Integrate the best insights from all sources',
          '2. Address the critique points',
          '3. Produce a comprehensive, well-structured final response',
          '4. Use clear headings and formatting',
          'Your output IS the final answer the user will see.',
        ].join('\n'),
        status: 'idle',
      },
    ];

    // Phase 1: Research
    const researcher = agents[0];
    researcher.status = 'thinking';
    onAgentUpdate({ ...researcher });

    try {
      researcher.output = await this.runAgentWithTools(researcher, task, tools);
      researcher.status = 'done';
    } catch (e) {
      researcher.output = `Error: ${e}`;
      researcher.status = 'error';
    }
    onAgentUpdate({ ...researcher });

    // Phase 2: Critique
    const critic = agents[1];
    critic.status = 'thinking';
    onAgentUpdate({ ...critic });

    const criticTask = `**Original task:** ${task}\n\n**Research findings:**\n${researcher.output || '(none)'}`;
    try {
      critic.output = await this.runAgentSimple(critic, criticTask);
      critic.status = 'done';
    } catch (e) {
      critic.output = `Error: ${e}`;
      critic.status = 'error';
    }
    onAgentUpdate({ ...critic });

    // Phase 3: Synthesize
    const synthesizer = agents[2];
    synthesizer.status = 'thinking';
    onAgentUpdate({ ...synthesizer });

    const synthTask = [
      `**Original task:** ${task}`,
      `\n**Research:**\n${researcher.output || '(none)'}`,
      `\n**Critique:**\n${critic.output || '(none)'}`,
    ].join('\n');

    try {
      synthesizer.output = await this.runAgentSimple(synthesizer, synthTask);
      synthesizer.status = 'done';
    } catch (e) {
      synthesizer.output = `Error: ${e}`;
      synthesizer.status = 'error';
    }
    onAgentUpdate({ ...synthesizer });

    return { agents, synthesis: synthesizer.output || '' };
  }

  private async runAgentSimple(agent: CoworkAgent, task: string): Promise<string> {
    const result = await this.client.simpleMessage({
      model: agent.model,
      messages: [{ role: 'user', content: task }],
      system: agent.systemPrompt,
      maxTokens: Math.min(this.maxTokens, 8096),
    });
    return result.text;
  }

  private async runAgentWithTools(
    agent: CoworkAgent,
    task: string,
    tools: Tool[]
  ): Promise<string> {
    const messages: Array<{ role: string; content: string | ContentBlock[] }> = [
      { role: 'user', content: task },
    ];

    let finalText = '';
    let maxTurns = 6;

    while (maxTurns-- > 0) {
      const result = await this.client.simpleMessage({
        model: agent.model,
        messages: messages as Array<{ role: string; content: string }>,
        system: agent.systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
        maxTokens: Math.min(this.maxTokens, 8096),
      });

      finalText = result.text;

      if (result.stopReason !== 'tool_use' || result.toolUses.length === 0) break;

      // Build assistant message with tool uses
      const assistantContent: ContentBlock[] = [];
      if (result.text) assistantContent.push({ type: 'text', text: result.text });
      for (const tu of result.toolUses) {
        assistantContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
      }
      messages.push({ role: 'assistant', content: assistantContent });

      // Execute tools and build tool results
      const toolResults: ContentBlock[] = [];
      for (const tu of result.toolUses) {
        const output = await executeVaultTool(this.app, tu.name, tu.input);
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: output });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return finalText;
  }
}
