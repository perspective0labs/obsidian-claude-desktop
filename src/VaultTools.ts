import { App, TFile, TFolder, Vault } from 'obsidian';
import type { Tool } from './types';

export function getVaultTools(): Tool[] {
  return [
    {
      name: 'read_note',
      description: "Read the full content of a note in the user's Obsidian vault",
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the note, e.g. "folder/note.md" or "note.md"' },
        },
        required: ['path'],
      },
    },
    {
      name: 'search_vault',
      description: 'Search for notes in the vault by filename or text content. Returns matching excerpts.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to search for' },
          limit: { type: 'number', description: 'Max results to return (default 8)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'create_or_update_note',
      description: 'Create a new note or overwrite/append to an existing note',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path for the note, e.g. "folder/note.md"' },
          content: { type: 'string', description: 'Markdown content to write' },
          append: { type: 'boolean', description: 'If true, append to existing content instead of replacing' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'list_notes',
      description: 'List notes in a vault folder',
      input_schema: {
        type: 'object',
        properties: {
          folder: { type: 'string', description: 'Folder path (empty string for root)' },
          recursive: { type: 'boolean', description: 'Include subfolders (default true)' },
        },
      },
    },
    {
      name: 'get_active_note',
      description: 'Get the content of the note the user currently has open in Obsidian',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_vault_structure',
      description: 'Get a tree overview of the vault folder structure',
      input_schema: {
        type: 'object',
        properties: {
          depth: { type: 'number', description: 'How many folder levels deep (default 3)' },
        },
      },
    },
    {
      name: 'delete_note',
      description: 'Delete a note from the vault (moves to trash)',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the note to delete' },
        },
        required: ['path'],
      },
    },
    {
      name: 'move_note',
      description: 'Move or rename a note',
      input_schema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Current path of the note' },
          to: { type: 'string', description: 'New path for the note' },
        },
        required: ['from', 'to'],
      },
    },
  ];
}

export async function executeVaultTool(
  app: App,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  const vault = app.vault;

  switch (name) {
    case 'read_note': {
      const path = input.path as string;
      const file = findFile(vault, path);
      if (!file) return `Error: Note not found — tried "${path}" and "${path}.md"`;
      return await vault.read(file);
    }

    case 'search_vault': {
      const query = (input.query as string).toLowerCase();
      const limit = Math.min((input.limit as number) || 8, 20);
      const files = vault.getMarkdownFiles();
      const results: Array<{ path: string; excerpt: string }> = [];

      for (const file of files) {
        if (results.length >= limit) break;
        const nameMatch = file.name.toLowerCase().includes(query);
        const content = await vault.read(file);
        const contentLower = content.toLowerCase();
        const contentMatch = contentLower.includes(query);

        if (nameMatch || contentMatch) {
          let excerpt = '';
          if (contentMatch) {
            const idx = contentLower.indexOf(query);
            const start = Math.max(0, idx - 80);
            excerpt = (start > 0 ? '...' : '') + content.slice(start, start + 300) + '...';
          } else {
            excerpt = content.slice(0, 200) + '...';
          }
          results.push({ path: file.path, excerpt: excerpt.replace(/\n+/g, ' ') });
        }
      }

      if (results.length === 0) return `No notes found matching "${input.query as string}".`;
      return results.map(r => `### ${r.path}\n${r.excerpt}`).join('\n\n---\n\n');
    }

    case 'create_or_update_note': {
      const path = normPath(input.path as string);
      const content = input.content as string;
      const append = input.append as boolean;

      await ensureFolders(vault, path);

      const existing = vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) {
        if (append) {
          const current = await vault.read(existing);
          await vault.modify(existing, current + '\n\n' + content);
          return `Appended to: ${path}`;
        } else {
          await vault.modify(existing, content);
          return `Updated: ${path}`;
        }
      } else {
        await vault.create(path, content);
        return `Created: ${path}`;
      }
    }

    case 'list_notes': {
      const folder = (input.folder as string) || '';
      const recursive = (input.recursive as boolean) !== false;
      const files = vault.getMarkdownFiles();

      const filtered = files.filter(f => {
        if (!folder) return true;
        const normalizedFolder = folder.endsWith('/') ? folder : folder + '/';
        if (recursive) return f.path.startsWith(normalizedFolder) || f.parent?.path === folder;
        return f.parent?.path === folder;
      });

      if (filtered.length === 0) return 'No notes found in that folder.';
      return filtered.map(f => f.path).sort().join('\n');
    }

    case 'get_active_note': {
      const activeFile = app.workspace.getActiveFile();
      if (!activeFile) return 'No note is currently open.';
      const content = await vault.read(activeFile);
      return `**Active note:** ${activeFile.path}\n\n${content}`;
    }

    case 'get_vault_structure': {
      const depth = Math.min((input.depth as number) || 3, 5);
      const root = vault.getRoot();
      return buildTree(root, depth, 0);
    }

    case 'delete_note': {
      const path = input.path as string;
      const file = findFile(vault, path);
      if (!file) return `Error: Note not found — "${path}"`;
      await vault.trash(file, true);
      return `Moved to trash: ${file.path}`;
    }

    case 'move_note': {
      const from = input.from as string;
      const to = normPath(input.to as string);
      const file = findFile(vault, from);
      if (!file) return `Error: Source note not found — "${from}"`;
      await ensureFolders(vault, to);
      await app.fileManager.renameFile(file, to);
      return `Moved: ${file.path} → ${to}`;
    }

    default:
      return `Unknown vault tool: ${name}`;
  }
}

function findFile(vault: Vault, path: string): TFile | null {
  let f = vault.getAbstractFileByPath(path);
  if (f instanceof TFile) return f;
  f = vault.getAbstractFileByPath(path + '.md');
  if (f instanceof TFile) return f;
  return null;
}

function normPath(path: string): string {
  return path.endsWith('.md') ? path : path + '.md';
}

async function ensureFolders(vault: Vault, filePath: string): Promise<void> {
  const parts = filePath.split('/');
  if (parts.length <= 1) return;
  const folders = parts.slice(0, -1);
  let current = '';
  for (const part of folders) {
    current = current ? current + '/' + part : part;
    if (!vault.getAbstractFileByPath(current)) {
      await vault.createFolder(current);
    }
  }
}

function buildTree(folder: TFolder, maxDepth: number, depth: number): string {
  if (depth >= maxDepth) return '';
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  const sorted = [...folder.children].sort((a, b) => {
    const aIsFolder = a instanceof TFolder ? 0 : 1;
    const bIsFolder = b instanceof TFolder ? 0 : 1;
    return aIsFolder - bIsFolder || a.name.localeCompare(b.name);
  });

  for (const child of sorted) {
    if (child instanceof TFolder) {
      lines.push(`${indent}📁 ${child.name}/`);
      const subtree = buildTree(child, maxDepth, depth + 1);
      if (subtree) lines.push(subtree);
    } else {
      lines.push(`${indent}📄 ${child.name}`);
    }
  }

  return lines.join('\n');
}
