import { readFileSync, writeFileSync, existsSync, mkdirSync, watchFile, unwatchFile, FSWatcher } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

export const DEFAULT_SYNC_PATH = join(homedir(), '.claude', 'system-prompt.md');

const TEMPLATE = `# Claude System Prompt

This file is shared between Claude Desktop Mirror (Obsidian) and Claude Code.
Edit it here, then click "Load from File" in Obsidian's Claude Desktop Mirror settings,
or enable Auto-Sync to pick it up automatically on startup.

---

You are a helpful assistant with deep knowledge of my work and Obsidian vault.
`;

export class SystemPromptSync {
  private watcher: ReturnType<typeof watchFile> | null = null;
  private watchPath: string | null = null;

  read(filePath: string): string {
    if (!existsSync(filePath)) return '';
    return readFileSync(filePath, 'utf8').trim();
  }

  write(filePath: string, content: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }

  ensureTemplate(filePath: string): boolean {
    if (existsSync(filePath)) return false;
    this.write(filePath, TEMPLATE);
    return true;
  }

  startWatch(filePath: string, onChange: (content: string) => void): void {
    this.stopWatch();
    this.watchPath = filePath;
    watchFile(filePath, { interval: 2000 }, () => {
      const content = this.read(filePath);
      onChange(content);
    });
  }

  stopWatch(): void {
    if (this.watchPath) {
      unwatchFile(this.watchPath);
      this.watchPath = null;
    }
  }
}
