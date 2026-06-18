import { App, TFile, normalizePath } from 'obsidian';
import type { Conversation, ModelId, PluginMode } from './types';

export class ConversationStore {
  private cache = new Map<string, Conversation>();

  constructor(private app: App, private folder: string) {}

  setFolder(folder: string) {
    this.folder = folder;
  }

  private async ensureFolder(): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(this.folder)) {
      await this.app.vault.createFolder(this.folder);
    }
  }

  private filePath(id: string): string {
    return normalizePath(`${this.folder}/${id}.json`);
  }

  async save(conv: Conversation): Promise<void> {
    await this.ensureFolder();
    conv.updatedAt = Date.now();
    const content = JSON.stringify(conv, null, 2);
    const path = this.filePath(conv.id);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
    this.cache.set(conv.id, conv);
  }

  async loadAll(): Promise<Conversation[]> {
    await this.ensureFolder();
    const files = this.app.vault
      .getFiles()
      .filter(f => f.path.startsWith(this.folder + '/') && f.extension === 'json');

    const results: Conversation[] = [];
    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const conv = JSON.parse(content) as Conversation;
        this.cache.set(conv.id, conv);
        results.push(conv);
      } catch {
        // skip malformed
      }
    }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async delete(id: string): Promise<void> {
    const path = this.filePath(id);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.vault.trash(file, true);
    this.cache.delete(id);
  }

  get(id: string): Conversation | undefined {
    return this.cache.get(id);
  }

  create(model: ModelId, mode: PluginMode): Conversation {
    const now = Date.now();
    const conv: Conversation = {
      id: `conv_${now}_${Math.random().toString(36).slice(2, 7)}`,
      title: 'New Conversation',
      messages: [],
      model,
      mode,
      createdAt: now,
      updatedAt: now,
    };
    this.cache.set(conv.id, conv);
    return conv;
  }
}
