import { App, TFile, normalizePath } from 'obsidian';
import type { Conversation, ContentBlock, Message } from './types';

export class ChatExporter {
  constructor(private app: App, private exportFolder: string) {}

  setFolder(folder: string) {
    this.exportFolder = folder;
  }

  async export(conv: Conversation): Promise<string> {
    await this.ensureFolder();
    const md = this.toMarkdown(conv);
    const safe = conv.title
      .replace(/[\\/:*?"<>|#^[\]]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    const path = normalizePath(`${this.exportFolder}/${safe}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, md);
    } else {
      await this.app.vault.create(path, md);
    }
    return path;
  }

  async exportAll(conversations: Conversation[]): Promise<number> {
    let count = 0;
    for (const conv of conversations) {
      if (conv.messages.length > 0) {
        await this.export(conv);
        count++;
      }
    }
    return count;
  }

  private toMarkdown(conv: Conversation): string {
    const date = new Date(conv.createdAt).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const updated = new Date(conv.updatedAt).toLocaleString();
    const modeLabel = conv.mode === 'cowork' ? 'Co-work' : conv.mode === 'code' ? 'Code' : 'Chat';
    const modelLabel = conv.model
      .replace('claude-', '')
      .replace('-20251001', '')
      .replace(/-/g, ' ');

    const lines: string[] = [
      `---`,
      `title: "${conv.title.replace(/"/g, "'")}"`,
      `date: ${date}`,
      `updated: ${updated}`,
      `model: ${modelLabel}`,
      `mode: ${modeLabel}`,
      `tags: [claude, chat]`,
      `---`,
      ``,
      `# ${conv.title}`,
      ``,
      `> **Model:** ${modelLabel} · **Mode:** ${modeLabel} · **Started:** ${date}`,
      ``,
      `---`,
      ``,
    ];

    // Filter out pure tool-result user messages (internal plumbing)
    const visible = conv.messages.filter(msg => {
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        return !(msg.content as ContentBlock[]).every(b => b.type === 'tool_result');
      }
      return true;
    });

    for (const msg of visible) {
      lines.push(...this.renderMessage(msg));
      lines.push('');
    }

    return lines.join('\n');
  }

  private renderMessage(msg: Message): string[] {
    const lines: string[] = [];
    const time = new Date(msg.timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit',
    });

    if (msg.role === 'user') {
      lines.push(`## 🧑 You  <small>${time}</small>`);
      lines.push('');
      lines.push(this.contentToText(msg.content));
    } else {
      lines.push(`## 🤖 Claude  <small>${time}</small>`);
      lines.push('');
      lines.push(this.contentToText(msg.content));
    }

    return lines;
  }

  private contentToText(content: string | ContentBlock[]): string {
    if (typeof content === 'string') return content;

    const parts: string[] = [];
    for (const block of content as ContentBlock[]) {
      if (block.type === 'text' && block.text) {
        parts.push(block.text);
      } else if (block.type === 'tool_use') {
        parts.push(
          `\`\`\`tool-call\n` +
          `tool: ${block.name}\n` +
          `input: ${JSON.stringify(block.input, null, 2)}\n` +
          `\`\`\``
        );
      } else if (block.type === 'tool_result') {
        const result = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
        const preview = result.length > 500 ? result.slice(0, 500) + '\n…(truncated)' : result;
        parts.push(`\`\`\`tool-result\n${preview}\n\`\`\``);
      }
    }
    return parts.join('\n\n');
  }

  private async ensureFolder(): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(this.exportFolder)) {
      await this.app.vault.createFolder(this.exportFolder);
    }
  }
}
