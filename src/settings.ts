import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type ClaudeDesktopMirror from './main';
import type { ClaudeSettings, ModelId } from './types';
import { SystemPromptSync, DEFAULT_SYNC_PATH } from './SystemPromptSync';

export const DEFAULT_SETTINGS: ClaudeSettings = {
  apiKey: '',
  defaultModel: 'claude-sonnet-4-6' as ModelId,
  conversationsFolder: 'Claude Conversations',
  systemPrompt: '',
  enableVaultTools: true,
  enableCodeMode: false,
  enableCowork: true,
  maxTokens: 8096,
  syncFilePath: DEFAULT_SYNC_PATH,
  autoSyncOnStartup: true,
  autoExportChats: true,
  exportFolder: 'Claude Conversations/Exports',
};

export class ClaudeSettingsTab extends PluginSettingTab {
  plugin: ClaudeDesktopMirror;
  private sync = new SystemPromptSync();
  private promptTextArea: HTMLTextAreaElement | null = null;

  constructor(app: App, plugin: ClaudeDesktopMirror) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Claude Desktop Mirror' });

    // ── API & Model ──────────────────────────────────────────────────────────

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your Anthropic API key (stored in Obsidian data only)')
      .addText(text =>
        text
          .setPlaceholder('sk-ant-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async value => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default Model')
      .setDesc('Default Claude model for new conversations')
      .addDropdown(drop =>
        drop
          .addOption('claude-haiku-4-5-20251001', 'Haiku 4.5 (Fast & cheap)')
          .addOption('claude-sonnet-4-6', 'Sonnet 4.6 (Balanced)')
          .addOption('claude-opus-4-8', 'Opus 4.8 (Most powerful)')
          .setValue(this.plugin.settings.defaultModel)
          .onChange(async value => {
            this.plugin.settings.defaultModel = value as ModelId;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Conversations Folder')
      .setDesc('Vault folder where conversations are saved')
      .addText(text =>
        text
          .setPlaceholder('Claude Conversations')
          .setValue(this.plugin.settings.conversationsFolder)
          .onChange(async value => {
            this.plugin.settings.conversationsFolder = value || 'Claude Conversations';
            await this.plugin.saveSettings();
          })
      );

    // ── System Prompt ────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'System Prompt' });

    const promptSetting = new Setting(containerEl)
      .setName('System Prompt')
      .setDesc('Applied to all conversations. Syncs with the file below.');

    promptSetting.addTextArea(text => {
      text
        .setPlaceholder('You are a helpful assistant…')
        .setValue(this.plugin.settings.systemPrompt)
        .onChange(async value => {
          this.plugin.settings.systemPrompt = value;
          await this.plugin.saveSettings();
        });
      text.inputEl.rows = 7;
      text.inputEl.style.width = '100%';
      text.inputEl.style.fontFamily = 'var(--font-monospace)';
      text.inputEl.style.fontSize = '12px';
      this.promptTextArea = text.inputEl;
      return text;
    });

    // ── Sync Section ─────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'System Prompt Sync' });

    const syncDesc = containerEl.createEl('p', { cls: 'setting-item-description' });
    syncDesc.innerHTML =
      'Sync your system prompt with a shared file at <code>' +
      this.plugin.settings.syncFilePath +
      '</code>. ' +
      'This file is read by Claude Code and can be updated from Claude Desktop\'s custom instructions manually. ' +
      'Use the buttons below to push/pull between Obsidian and the file.';

    new Setting(containerEl)
      .setName('Sync File Path')
      .setDesc('Absolute path to the shared system prompt file')
      .addText(text =>
        text
          .setPlaceholder(DEFAULT_SYNC_PATH)
          .setValue(this.plugin.settings.syncFilePath)
          .onChange(async value => {
            this.plugin.settings.syncFilePath = value.trim() || DEFAULT_SYNC_PATH;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Auto-sync on Startup')
      .setDesc('Load the system prompt from the sync file when Obsidian starts')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.autoSyncOnStartup).onChange(async value => {
          this.plugin.settings.autoSyncOnStartup = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Load from File')
      .setDesc('Overwrite the system prompt above with the contents of the sync file')
      .addButton(btn =>
        btn
          .setButtonText('⬇ Load')
          .setTooltip('Read from file → Obsidian')
          .onClick(async () => {
            const path = this.plugin.settings.syncFilePath;
            this.sync.ensureTemplate(path);
            const content = this.sync.read(path);
            if (!content) {
              new Notice('Sync file is empty or not found.');
              return;
            }
            this.plugin.settings.systemPrompt = content;
            await this.plugin.saveSettings();
            if (this.promptTextArea) this.promptTextArea.value = content;
            new Notice('System prompt loaded from file ✓');
          })
      )
      .addButton(btn =>
        btn
          .setButtonText('⬆ Save to File')
          .setTooltip('Write Obsidian prompt → file')
          .onClick(async () => {
            const path = this.plugin.settings.syncFilePath;
            const content = this.plugin.settings.systemPrompt;
            this.sync.write(path, content);
            new Notice(`Saved to ${path} ✓`);
          })
      )
      .addButton(btn =>
        btn
          .setButtonText('📄 Open File')
          .setTooltip('Open sync file in your editor')
          .onClick(() => {
            const path = this.plugin.settings.syncFilePath;
            this.sync.ensureTemplate(path);
            // Open with Electron's shell
            try {
              const { shell } = require('electron');
              shell.openPath(path);
            } catch {
              new Notice(`Open manually: ${path}`);
            }
          })
      );

    // Status line
    const statusEl = containerEl.createEl('p', { cls: 'cdm-sync-status' });
    this.updateSyncStatus(statusEl);

    // ── Chat Export ──────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Chat History Export' });

    new Setting(containerEl)
      .setName('Auto-export Conversations')
      .setDesc('After each reply, write the conversation as a readable markdown note in your vault')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.autoExportChats).onChange(async value => {
          this.plugin.settings.autoExportChats = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Export Folder')
      .setDesc('Vault folder where markdown exports are written')
      .addText(text =>
        text
          .setPlaceholder('Claude Conversations/Exports')
          .setValue(this.plugin.settings.exportFolder)
          .onChange(async value => {
            this.plugin.settings.exportFolder = value || 'Claude Conversations/Exports';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Export All Now')
      .setDesc('Write all existing conversations to markdown in the export folder')
      .addButton(btn =>
        btn
          .setButtonText('Export All')
          .onClick(async () => {
            btn.setButtonText('Exporting…');
            btn.buttonEl.disabled = true;
            try {
              const convs = await this.plugin.store.loadAll();
              const count = await this.plugin.exporter.exportAll(convs);
              new Notice(`Exported ${count} conversation${count !== 1 ? 's' : ''} ✓`);
            } catch (e) {
              new Notice(`Export error: ${e}`);
            } finally {
              btn.setButtonText('Export All');
              btn.buttonEl.disabled = false;
            }
          })
      );

    // ── Features ─────────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Features' });

    new Setting(containerEl)
      .setName('Vault Tools')
      .setDesc('Claude can read, search, create, and edit notes in your vault')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableVaultTools).onChange(async value => {
          this.plugin.settings.enableVaultTools = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Co-work Mode')
      .setDesc('Multi-agent sessions: Researcher → Critic → Synthesizer')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableCowork).onChange(async value => {
          this.plugin.settings.enableCowork = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Code Mode')
      .setDesc('Shell command execution, file read/write, directory listing')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableCodeMode).onChange(async value => {
          this.plugin.settings.enableCodeMode = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Max Tokens')
      .setDesc(`Maximum tokens per response (current: ${this.plugin.settings.maxTokens})`)
      .addSlider(slider =>
        slider
          .setLimits(1024, 32000, 1024)
          .setValue(this.plugin.settings.maxTokens)
          .setDynamicTooltip()
          .onChange(async value => {
            this.plugin.settings.maxTokens = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private updateSyncStatus(el: HTMLElement) {
    const path = this.plugin.settings.syncFilePath;
    const { existsSync } = require('fs');
    if (existsSync(path)) {
      const { statSync } = require('fs');
      const mtime = statSync(path).mtime;
      el.textContent = `✓ Sync file found — last modified ${mtime.toLocaleString()}`;
      el.style.color = 'var(--color-green, #4caf50)';
    } else {
      el.textContent = `⚠ Sync file not yet created — click "Save to File" or "Open File" to create it`;
      el.style.color = 'var(--color-yellow, #e8a000)';
    }
    el.style.fontSize = '12px';
    el.style.marginTop = '4px';
  }
}
