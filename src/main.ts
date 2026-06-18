import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_CLAUDE, ClaudeView } from './ChatView';
import { ClaudeSettingsTab, DEFAULT_SETTINGS } from './settings';
import { ConversationStore } from './ConversationStore';
import { SystemPromptSync } from './SystemPromptSync';
import { ChatExporter } from './ChatExporter';
import type { ClaudeSettings } from './types';

export default class ClaudeDesktopMirror extends Plugin {
  settings!: ClaudeSettings;
  store!: ConversationStore;
  promptSync = new SystemPromptSync();
  exporter!: ChatExporter;

  async onload() {
    await this.loadSettings();
    this.store = new ConversationStore(this.app, this.settings.conversationsFolder);
    this.exporter = new ChatExporter(this.app, this.settings.exportFolder);

    // Auto-sync system prompt from file on startup
    if (this.settings.autoSyncOnStartup && this.settings.syncFilePath) {
      this.app.workspace.onLayoutReady(() => this.autoSyncPrompt());
    }

    this.registerView(VIEW_TYPE_CLAUDE, leaf => new ClaudeView(leaf, this));

    this.addRibbonIcon('bot', 'Claude Desktop Mirror', () => this.openView());

    this.addCommand({
      id: 'open-claude',
      name: 'Open Claude',
      callback: () => this.openView(),
    });

    this.addCommand({
      id: 'claude-new-conversation',
      name: 'New Claude Conversation',
      callback: () => {
        const view = this.getActiveView();
        if (view) {
          view.startNew();
          this.app.workspace.revealLeaf(
            this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE)[0]
          );
        } else {
          this.openView();
        }
      },
    });

    this.addCommand({
      id: 'claude-export-all',
      name: 'Export All Claude Conversations to Markdown',
      callback: async () => {
        const convs = await this.store.loadAll();
        const count = await this.exporter.exportAll(convs);
        new Notice(`Exported ${count} conversation${count !== 1 ? 's' : ''} ✓`);
      },
    });

    this.addCommand({
      id: 'claude-sync-prompt',
      name: 'Sync System Prompt from File',
      callback: async () => {
        const path = this.settings.syncFilePath;
        const content = this.promptSync.read(path);
        if (!content) { new Notice('Sync file is empty or missing.'); return; }
        this.settings.systemPrompt = content;
        await this.saveSettings();
        new Notice('System prompt synced ✓');
      },
    });

    this.addSettingTab(new ClaudeSettingsTab(this.app, this));
  }

  async onunload() {
    this.promptSync.stopWatch();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CLAUDE);
  }

  private async autoSyncPrompt() {
    const path = this.settings.syncFilePath;
    const content = this.promptSync.read(path);
    if (content && content !== this.settings.systemPrompt) {
      this.settings.systemPrompt = content;
      await this.saveData(this.settings);
      new Notice('Claude: system prompt synced from file', 3000);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.store.setFolder(this.settings.conversationsFolder);
    this.exporter.setFolder(this.settings.exportFolder);
    this.getActiveView()?.refreshClient();
  }

  async openView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE);
    if (leaves.length > 0) {
      this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_CLAUDE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  getActiveView(): ClaudeView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE);
    return leaves.length > 0 ? (leaves[0].view as ClaudeView) : null;
  }
}
