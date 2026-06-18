import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { Tool } from './types';

const execAsync = promisify(exec);

export function getCodeTools(): Tool[] {
  return [
    {
      name: 'run_command',
      description: 'Execute a shell command and return stdout/stderr. Use PowerShell syntax on Windows.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run' },
          cwd: { type: 'string', description: 'Working directory (optional)' },
          timeout: { type: 'number', description: 'Timeout in ms (default 30000)' },
        },
        required: ['command'],
      },
    },
    {
      name: 'read_file',
      description: 'Read a file from the filesystem (outside the vault)',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute file path' },
          encoding: { type: 'string', description: 'Encoding (default utf8)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Write content to a file on the filesystem',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute file path' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'list_directory',
      description: 'List files and directories at a path',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path' },
        },
        required: ['path'],
      },
    },
  ];
}

export async function executeCodeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'run_command': {
      const command = input.command as string;
      const cwd = (input.cwd as string) || process.cwd();
      const timeout = (input.timeout as number) || 30000;

      try {
        const { stdout, stderr } = await execAsync(command, { cwd, timeout });
        const out = stdout.trim();
        const err = stderr.trim();
        let result = '';
        if (out) result += `STDOUT:\n${out}`;
        if (err) result += (result ? '\n\n' : '') + `STDERR:\n${err}`;
        return result || '(no output)';
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; message?: string };
        return `Error: ${err.message || e}\n${err.stderr || ''}`.trim();
      }
    }

    case 'read_file': {
      const path = input.path as string;
      if (!existsSync(path)) return `Error: File not found: ${path}`;
      try {
        const content = readFileSync(path, (input.encoding as BufferEncoding) || 'utf8');
        return content;
      } catch (e) {
        return `Error reading file: ${e}`;
      }
    }

    case 'write_file': {
      const path = input.path as string;
      const content = input.content as string;
      try {
        writeFileSync(path, content, 'utf8');
        return `Written: ${path}`;
      } catch (e) {
        return `Error writing file: ${e}`;
      }
    }

    case 'list_directory': {
      const path = input.path as string;
      if (!existsSync(path)) return `Error: Directory not found: ${path}`;
      try {
        const entries = readdirSync(path);
        return entries
          .map(name => {
            const full = join(path, name);
            const isDir = statSync(full).isDirectory();
            return isDir ? `📁 ${name}/` : `📄 ${name}`;
          })
          .join('\n');
      } catch (e) {
        return `Error listing directory: ${e}`;
      }
    }

    default:
      return `Unknown code tool: ${name}`;
  }
}
