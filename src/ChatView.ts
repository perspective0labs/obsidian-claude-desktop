import { App, ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, setIcon } from 'obsidian';
import type ClaudeDesktopMirror from './main';
import type { ContentBlock, Conversation, CoworkAgent, Message, ModelId, PluginMode } from './types';
import { AnthropicClient } from './AnthropicClient';
import { getVaultTools, executeVaultTool } from './VaultTools';
import { getCodeTools, executeCodeTool } from './CodeTools';
import { CoworkManager } from './CoworkManager';

export const VIEW_TYPE_CLAUDE = 'claude-desktop-mirror';

export class ClaudeView extends ItemView {
  plugin: ClaudeDesktopMirror;
  private client: AnthropicClient;

  private currentConv: Conversation | null = null;
  private conversations: Conversation[] = [];
  private isStreaming = false;

  // UI refs
  private sidebarEl!: HTMLElement;
  private convListEl!: HTMLElement;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private modelSelect!: HTMLSelectElement;
  private modeSelect!: HTMLSelectElement;
  private statusEl!: HTMLElement;
  private topbarTitleEl!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: ClaudeDesktopMirror) {
    super(leaf);
    this.plugin = plugin;
    this.client = new AnthropicClient(plugin.settings.apiKey);
  }

  getViewType() { return VIEW_TYPE_CLAUDE; }
  getDisplayText() { return 'Claude'; }
  getIcon() { return 'bot'; }

  async onOpen() {
    this.client = new AnthropicClient(this.plugin.settings.apiKey);
    this.buildUI();
    this.conversations = await this.plugin.store.loadAll();
    this.renderConvList();
    this.startNew();
  }

  async onClose() {}

  refreshClient() {
    this.client.setApiKey(this.plugin.settings.apiKey);
    this.updateModeOptions();
  }

  // ─── UI Build ────────────────────────────────────────────────────────────────

  private buildUI() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('cdm-root');

    this.sidebarEl = root.createDiv({ cls: 'cdm-sidebar' });
    this.buildSidebar();

    const main = root.createDiv({ cls: 'cdm-main' });
    this.buildMain(main);
  }

  private buildSidebar() {
    const hdr = this.sidebarEl.createDiv({ cls: 'cdm-sidebar-hdr' });

    const brand = hdr.createDiv({ cls: 'cdm-brand' });
    brand.createEl('span', { cls: 'cdm-brand-icon', text: 'C' });
    brand.createEl('span', { cls: 'cdm-brand-name', text: 'Claude' });

    const newBtn = hdr.createEl('button', { cls: 'cdm-icon-btn', attr: { title: 'New conversation' } });
    setIcon(newBtn, 'square-pen');
    newBtn.addEventListener('click', () => this.startNew());

    this.convListEl = this.sidebarEl.createDiv({ cls: 'cdm-conv-list' });
  }

  private buildMain(main: HTMLElement) {
    // Topbar
    const topbar = main.createDiv({ cls: 'cdm-topbar' });

    this.topbarTitleEl = topbar.createDiv({ cls: 'cdm-topbar-title' });

    const controls = topbar.createDiv({ cls: 'cdm-topbar-controls' });

    this.modelSelect = controls.createEl('select', { cls: 'cdm-select' });
    [
      ['claude-haiku-4-5-20251001', '⚡ Haiku 4.5'],
      ['claude-sonnet-4-6', '✦ Sonnet 4.6'],
      ['claude-opus-4-8', '◈ Opus 4.8'],
    ].forEach(([value, label]) => {
      const opt = this.modelSelect.createEl('option', { value, text: label });
      if (value === this.plugin.settings.defaultModel) opt.selected = true;
    });
    this.modelSelect.addEventListener('change', () => {
      if (this.currentConv) this.currentConv.model = this.modelSelect.value as ModelId;
    });

    this.modeSelect = controls.createEl('select', { cls: 'cdm-select' });
    this.updateModeOptions();
    this.modeSelect.addEventListener('change', () => {
      if (this.currentConv) this.currentConv.mode = this.modeSelect.value as PluginMode;
    });

    this.statusEl = topbar.createDiv({ cls: 'cdm-status' });

    // Messages
    this.messagesEl = main.createDiv({ cls: 'cdm-messages' });

    // Input
    const inputArea = main.createDiv({ cls: 'cdm-input-area' });
    const wrap = inputArea.createDiv({ cls: 'cdm-input-wrap' });

    this.inputEl = wrap.createEl('textarea', {
      cls: 'cdm-input',
      attr: { placeholder: 'Message Claude…', rows: '1' },
    });
    this.inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    this.inputEl.addEventListener('input', () => this.autoResize());

    this.sendBtn = wrap.createEl('button', { cls: 'cdm-send-btn', attr: { title: 'Send' } });
    setIcon(this.sendBtn, 'send');
    this.sendBtn.addEventListener('click', () => this.send());

    inputArea.createEl('p', {
      text: 'Claude can make mistakes. Vault tools enabled.',
      cls: 'cdm-footer-note',
    });
  }

  private updateModeOptions() {
    if (!this.modeSelect) return;
    const current = this.modeSelect.value;
    this.modeSelect.empty();
    this.modeSelect.createEl('option', { value: 'chat', text: '💬 Chat' });
    if (this.plugin.settings.enableCowork)
      this.modeSelect.createEl('option', { value: 'cowork', text: '🤝 Co-work' });
    if (this.plugin.settings.enableCodeMode)
      this.modeSelect.createEl('option', { value: 'code', text: '💻 Code' });
    if (current) this.modeSelect.value = current;
  }

  // ─── Conversation List ────────────────────────────────────────────────────────

  private renderConvList() {
    this.convListEl.empty();

    if (this.conversations.length === 0) {
      this.convListEl.createEl('p', { text: 'No conversations yet', cls: 'cdm-conv-empty' });
      return;
    }

    // Group by date
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let lastGroup = '';

    for (const conv of this.conversations) {
      const d = new Date(conv.updatedAt);
      const group =
        d.toDateString() === today ? 'Today'
        : d.toDateString() === yesterday ? 'Yesterday'
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      if (group !== lastGroup) {
        this.convListEl.createEl('div', { text: group, cls: 'cdm-conv-group' });
        lastGroup = group;
      }

      const item = this.convListEl.createDiv({ cls: 'cdm-conv-item' });
      if (conv.id === this.currentConv?.id) item.addClass('active');

      const modeEmoji = conv.mode === 'cowork' ? '🤝 ' : conv.mode === 'code' ? '💻 ' : '';
      item.createEl('span', { text: modeEmoji + conv.title, cls: 'cdm-conv-title' });
      item.addEventListener('click', () => this.loadConv(conv));

      const del = item.createEl('button', { cls: 'cdm-conv-del', attr: { title: 'Delete' } });
      setIcon(del, 'trash-2');
      del.addEventListener('click', async e => {
        e.stopPropagation();
        await this.plugin.store.delete(conv.id);
        this.conversations = this.conversations.filter(c => c.id !== conv.id);
        if (this.currentConv?.id === conv.id) this.startNew();
        this.renderConvList();
      });
    }
  }

  startNew() {
    const mode = (this.modeSelect?.value || 'chat') as PluginMode;
    const model = (this.modelSelect?.value || this.plugin.settings.defaultModel) as ModelId;
    this.currentConv = this.plugin.store.create(model, mode);
    this.messagesEl?.empty();
    this.renderWelcome();
    this.renderConvList();
    this.topbarTitleEl && (this.topbarTitleEl.textContent = '');
  }

  private loadConv(conv: Conversation) {
    this.currentConv = conv;
    if (this.modelSelect) this.modelSelect.value = conv.model;
    if (this.modeSelect) this.modeSelect.value = conv.mode;
    if (this.topbarTitleEl) this.topbarTitleEl.textContent = conv.title;
    this.messagesEl.empty();
    this.renderAllMessages();
    this.renderConvList();
  }

  // ─── Welcome ─────────────────────────────────────────────────────────────────

  private renderWelcome() {
    const el = this.messagesEl.createDiv({ cls: 'cdm-welcome' });
    el.createEl('div', { cls: 'cdm-welcome-logo', text: 'C' });
    el.createEl('h2', { text: 'How can I help you today?' });

    const mode = this.modeSelect?.value || 'chat';
    if (mode === 'cowork') {
      el.createEl('p', { text: '🤝 Co-work mode — a team of agents (Researcher, Critic, Synthesizer) will collaborate on your request.' });
    } else if (mode === 'code') {
      el.createEl('p', { text: '💻 Code mode — I can run shell commands, read and write files, and help with technical tasks.' });
    } else if (this.plugin.settings.enableVaultTools) {
      el.createEl('p', { text: 'I have access to your vault and can read, search, and write notes.' });
    }
  }

  // ─── Sending ──────────────────────────────────────────────────────────────────

  private async send() {
    if (!this.currentConv || this.isStreaming) return;
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = '';
    this.autoResize();

    const mode = this.modeSelect.value as PluginMode;
    if (mode === 'cowork' && this.plugin.settings.enableCowork) {
      await this.runCowork(text);
    } else {
      await this.runChat(text);
    }
  }

  // ─── Chat ────────────────────────────────────────────────────────────────────

  private async runChat(text: string) {
    if (!this.currentConv) return;

    this.messagesEl.querySelector('.cdm-welcome')?.remove();
    this.isStreaming = true;
    this.sendBtn.disabled = true;

    const userMsg = this.addMessage('user', text);
    this.renderConvList();

    if (this.currentConv.messages.length === 1) {
      const title = text.slice(0, 52) + (text.length > 52 ? '…' : '');
      this.currentConv.title = title;
      if (this.topbarTitleEl) this.topbarTitleEl.textContent = title;
    }

    const tools = [
      ...(this.plugin.settings.enableVaultTools ? getVaultTools() : []),
      ...(this.modeSelect.value === 'code' && this.plugin.settings.enableCodeMode ? getCodeTools() : []),
    ];

    const system = this.buildSystem();
    this.setStatus('Thinking…');

    // Streaming assistant bubble
    const { wrap: assistantWrap, bubble } = this.createMessageBubble('assistant');
    const streamEl = bubble.createDiv({ cls: 'cdm-stream' });
    let streamText = '';
    const pendingToolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    try {
      await this.client.streamMessage({
        model: this.currentConv.model,
        messages: this.buildApiMessages(),
        system,
        tools: tools.length > 0 ? tools : undefined,
        maxTokens: this.plugin.settings.maxTokens,
        callbacks: {
          onText: chunk => {
            streamText += chunk;
            streamEl.empty();
            MarkdownRenderer.render(this.app, streamText, streamEl, '', this);
            this.scrollBottom();
          },
          onToolUse: (id, name, input) => {
            pendingToolUses.push({ id, name, input });
          },
          onComplete: async () => {
            if (pendingToolUses.length > 0) {
              await this.handleToolUses(streamText, pendingToolUses, bubble, tools, system);
            } else {
              this.finalizeMessage(streamText);
            }
          },
          onError: err => {
            streamEl.empty();
            streamEl.createEl('p', { text: `❌ ${err.message}`, cls: 'cdm-error' });
            this.done();
          },
        },
      });
    } catch (e) {
      new Notice(`Claude error: ${e}`);
      this.done();
    }
  }

  private async handleToolUses(
    precedingText: string,
    toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    bubble: HTMLElement,
    tools: ReturnType<typeof getVaultTools>,
    system: string
  ) {
    if (!this.currentConv) return;

    // Save assistant message with tool uses
    const assistantContent: ContentBlock[] = [];
    if (precedingText) assistantContent.push({ type: 'text', text: precedingText });
    for (const tu of toolUses) {
      assistantContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
      this.renderToolUse(bubble, tu.name, tu.input);
    }
    this.currentConv.messages.push({
      id: `msg_${Date.now()}_a`,
      role: 'assistant',
      content: assistantContent,
      timestamp: Date.now(),
    });

    // Execute tools
    this.setStatus('Running tools…');
    const toolResults: ContentBlock[] = [];
    for (const tu of toolUses) {
      const result = tu.name.startsWith('run_command') || tu.name === 'read_file' || tu.name === 'write_file' || tu.name === 'list_directory'
        ? await executeCodeTool(tu.name, tu.input)
        : await executeVaultTool(this.app, tu.name, tu.input);
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
      this.renderToolResult(bubble, result);
    }

    this.currentConv.messages.push({
      id: `msg_${Date.now()}_tr`,
      role: 'user',
      content: toolResults,
      timestamp: Date.now(),
    });

    // Continue with tool results
    this.setStatus('Continuing…');
    const continueEl = bubble.createDiv({ cls: 'cdm-stream' });
    let continueText = '';

    await this.client.streamMessage({
      model: this.currentConv.model,
      messages: this.buildApiMessages(),
      system,
      tools: tools.length > 0 ? tools : undefined,
      maxTokens: this.plugin.settings.maxTokens,
      callbacks: {
        onText: chunk => {
          continueText += chunk;
          continueEl.empty();
          MarkdownRenderer.render(this.app, continueText, continueEl, '', this);
          this.scrollBottom();
        },
        onToolUse: () => {},
        onComplete: () => this.finalizeMessage(continueText),
        onError: err => {
          continueEl.createEl('p', { text: `❌ ${err.message}`, cls: 'cdm-error' });
          this.done();
        },
      },
    });
  }

  private finalizeMessage(text: string) {
    if (!this.currentConv) return;
    this.currentConv.messages.push({
      id: `msg_${Date.now()}_f`,
      role: 'assistant',
      content: text,
      timestamp: Date.now(),
    });
    this.plugin.store.save(this.currentConv);
    if (this.plugin.settings.autoExportChats) {
      this.plugin.exporter.export(this.currentConv).catch(() => {});
    }
    if (!this.conversations.find(c => c.id === this.currentConv!.id)) {
      this.conversations.unshift(this.currentConv!);
    }
    this.renderConvList();
    this.done();
  }

  // ─── Co-work ─────────────────────────────────────────────────────────────────

  private async runCowork(task: string) {
    if (!this.currentConv) return;

    this.messagesEl.querySelector('.cdm-welcome')?.remove();
    this.isStreaming = true;
    this.sendBtn.disabled = true;

    this.addMessage('user', task);
    if (this.currentConv.messages.length === 1) {
      this.currentConv.title = '🤝 ' + task.slice(0, 48);
      if (this.topbarTitleEl) this.topbarTitleEl.textContent = this.currentConv.title;
    }

    const panel = this.messagesEl.createDiv({ cls: 'cdm-cowork-panel' });
    panel.createEl('h3', { text: '🤝 Co-work Session', cls: 'cdm-cowork-heading' });
    const agentsContainer = panel.createDiv({ cls: 'cdm-cowork-agents' });

    const agentEls = new Map<string, { statusEl: HTMLElement; outputEl: HTMLElement }>();

    const onAgentUpdate = (agent: CoworkAgent) => {
      if (!agentEls.has(agent.id)) {
        const el = agentsContainer.createDiv({ cls: 'cdm-agent' });
        const hdr = el.createDiv({ cls: 'cdm-agent-hdr' });
        hdr.createEl('span', { text: agent.name, cls: 'cdm-agent-name' });
        const statusEl = hdr.createEl('span', { cls: 'cdm-agent-status' });
        el.createEl('p', { text: agent.role, cls: 'cdm-agent-role' });
        const outputEl = el.createDiv({ cls: 'cdm-agent-output' });
        agentEls.set(agent.id, { statusEl, outputEl });
      }

      const { statusEl, outputEl } = agentEls.get(agent.id)!;
      statusEl.className = `cdm-agent-status cdm-agent-${agent.status}`;
      statusEl.textContent =
        agent.status === 'thinking' ? '⟳ Working…'
        : agent.status === 'done' ? '✓ Done'
        : agent.status === 'error' ? '✗ Error'
        : '';

      if (agent.output) {
        outputEl.empty();
        MarkdownRenderer.render(this.app, agent.output, outputEl, '', this);
      }
      this.scrollBottom();
    };

    const manager = new CoworkManager(
      this.client,
      this.app,
      this.currentConv.model,
      this.plugin.settings.maxTokens
    );

    this.setStatus('Co-work in progress…');

    try {
      const result = await manager.runCowork(
        task,
        onAgentUpdate,
        this.plugin.settings.enableVaultTools
      );

      const synthEl = panel.createDiv({ cls: 'cdm-cowork-synthesis' });
      synthEl.createEl('h3', { text: '📋 Final Answer', cls: 'cdm-synthesis-heading' });
      const synthContent = synthEl.createDiv();
      MarkdownRenderer.render(this.app, result.synthesis, synthContent, '', this);

      this.currentConv.messages.push({
        id: `msg_${Date.now()}_cw`,
        role: 'assistant',
        content: `**Co-work Result**\n\n${result.synthesis}`,
        timestamp: Date.now(),
      });

      await this.plugin.store.save(this.currentConv);
      if (this.plugin.settings.autoExportChats) {
        this.plugin.exporter.export(this.currentConv).catch(() => {});
      }
      if (!this.conversations.find(c => c.id === this.currentConv!.id)) {
        this.conversations.unshift(this.currentConv!);
      }
      this.renderConvList();
    } catch (e) {
      panel.createEl('p', { text: `❌ Co-work error: ${e}`, cls: 'cdm-error' });
      new Notice(`Co-work error: ${e}`);
    } finally {
      this.done();
      this.scrollBottom();
    }
  }

  // ─── Message Rendering ────────────────────────────────────────────────────────

  private addMessage(role: 'user' | 'assistant', text: string): Message {
    const msg: Message = {
      id: `msg_${Date.now()}`,
      role,
      content: text,
      timestamp: Date.now(),
    };
    this.currentConv!.messages.push(msg);
    this.renderMessage(msg);
    this.scrollBottom();
    return msg;
  }

  private renderAllMessages() {
    if (!this.currentConv) return;
    for (const msg of this.currentConv.messages) {
      // skip tool_result messages from user (they're internal)
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const hasOnlyToolResults = (msg.content as ContentBlock[]).every(b => b.type === 'tool_result');
        if (hasOnlyToolResults) continue;
      }
      this.renderMessage(msg);
    }
    this.scrollBottom();
  }

  private renderMessage(msg: Message) {
    const { wrap, bubble } = this.createMessageBubble(msg.role);

    if (typeof msg.content === 'string') {
      MarkdownRenderer.render(this.app, msg.content, bubble, '', this);
    } else {
      for (const block of msg.content as ContentBlock[]) {
        if (block.type === 'text' && block.text) {
          MarkdownRenderer.render(this.app, block.text, bubble, '', this);
        } else if (block.type === 'tool_use') {
          this.renderToolUse(bubble, block.name, block.input);
        } else if (block.type === 'tool_result') {
          this.renderToolResult(bubble, block.content as string);
        }
      }
    }

    if (msg.role === 'assistant') this.addCopyBtn(wrap, msg);
    return wrap;
  }

  private createMessageBubble(role: 'user' | 'assistant'): { wrap: HTMLElement; bubble: HTMLElement } {
    const wrap = this.messagesEl.createDiv({ cls: `cdm-msg cdm-msg-${role}` });

    if (role === 'assistant') {
      const av = wrap.createDiv({ cls: 'cdm-avatar' });
      av.createEl('span', { text: 'C' });
    }

    const bubble = wrap.createDiv({ cls: 'cdm-bubble' });
    return { wrap, bubble };
  }

  private renderToolUse(container: HTMLElement, name: string, input: Record<string, unknown>) {
    const el = container.createDiv({ cls: 'cdm-tool-call' });
    const hdr = el.createDiv({ cls: 'cdm-tool-hdr' });
    const iconSpan = hdr.createSpan();
    setIcon(iconSpan, 'terminal');
    hdr.createEl('span', { text: ` ${name}`, cls: 'cdm-tool-name' });

    const det = el.createEl('details');
    det.createEl('summary', { text: 'Input' });
    det.createEl('pre', { text: JSON.stringify(input, null, 2), cls: 'cdm-tool-json' });
  }

  private renderToolResult(container: HTMLElement, result: string) {
    const el = container.createDiv({ cls: 'cdm-tool-result' });
    const hdr = el.createDiv({ cls: 'cdm-tool-result-hdr' });
    const iconSpan = hdr.createSpan();
    setIcon(iconSpan, 'check-circle-2');
    hdr.createEl('span', { text: ' Result' });

    const det = el.createEl('details');
    det.createEl('summary', { text: 'Output' });
    const preview = result.length > 3000 ? result.slice(0, 3000) + '\n\n…(truncated)' : result;
    det.createEl('pre', { text: preview, cls: 'cdm-tool-output' });
  }

  private addCopyBtn(wrap: HTMLElement, msg: Message) {
    const actions = wrap.createDiv({ cls: 'cdm-msg-actions' });
    const btn = actions.createEl('button', { cls: 'cdm-icon-btn-sm', attr: { title: 'Copy' } });
    setIcon(btn, 'copy');
    btn.addEventListener('click', () => {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (msg.content as ContentBlock[]).filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
      navigator.clipboard.writeText(text);
      new Notice('Copied');
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private buildApiMessages(): Array<{ role: string; content: string | ContentBlock[] }> {
    if (!this.currentConv) return [];
    const result: Array<{ role: string; content: string | ContentBlock[] }> = [];

    for (const msg of this.currentConv.messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
      } else {
        result.push({ role: msg.role, content: msg.content as ContentBlock[] });
      }
    }

    return result;
  }

  private buildSystem(): string {
    const parts: string[] = [];

    if (this.plugin.settings.systemPrompt) parts.push(this.plugin.settings.systemPrompt);

    if (this.plugin.settings.enableVaultTools) {
      parts.push(
        "You have access to the user's Obsidian vault through tools. Use them proactively when the user asks about their notes, wants to create or edit content, or when vault context would help you answer better."
      );
    }

    const mode = this.modeSelect?.value;
    if (mode === 'code') {
      parts.push(
        'You are in Code Mode. You have access to shell command execution (run_command), file read/write, and directory listing tools in addition to vault tools. Be precise and careful with commands.'
      );
    }

    return parts.join('\n\n');
  }

  private setStatus(text: string) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  private done() {
    this.isStreaming = false;
    this.sendBtn.disabled = false;
    this.setStatus('');
  }

  private scrollBottom() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private autoResize() {
    this.inputEl.style.height = 'auto';
    this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 180) + 'px';
  }
}
