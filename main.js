var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ClaudeDesktopMirror
});
module.exports = __toCommonJS(main_exports);
var import_obsidian6 = require("obsidian");

// src/ChatView.ts
var import_obsidian2 = require("obsidian");

// src/AnthropicClient.ts
var AnthropicClient = class {
  constructor(apiKey) {
    this.baseUrl = "https://api.anthropic.com/v1";
    this.apiKey = apiKey;
  }
  setApiKey(key) {
    this.apiKey = key;
  }
  async streamMessage(params) {
    var _a;
    const { model, messages, system, tools, maxTokens, callbacks } = params;
    if (!this.apiKey) {
      callbacks.onError(new Error("No API key set. Add your Anthropic API key in Settings \u2192 Claude Desktop Mirror."));
      return;
    }
    const body = {
      model,
      messages,
      max_tokens: maxTokens,
      stream: true
    };
    if (system)
      body.system = system;
    if (tools && tools.length > 0)
      body.tools = tools;
    let response;
    try {
      response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify(body)
      });
    } catch (err) {
      callbacks.onError(new Error(`Network error: ${err}`));
      return;
    }
    if (!response.ok) {
      let msg = `API error ${response.status}`;
      try {
        const errBody = await response.json();
        msg = ((_a = errBody == null ? void 0 : errBody.error) == null ? void 0 : _a.message) || msg;
      } catch (e) {
      }
      callbacks.onError(new Error(msg));
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentToolId = "";
    let currentToolName = "";
    let currentToolInputStr = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: "))
            continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]" || !data)
            continue;
          let event;
          try {
            event = JSON.parse(data);
          } catch (e) {
            continue;
          }
          switch (event.type) {
            case "content_block_start": {
              const cb = event.content_block;
              if ((cb == null ? void 0 : cb.type) === "tool_use") {
                currentToolId = cb.id;
                currentToolName = cb.name;
                currentToolInputStr = "";
              }
              break;
            }
            case "content_block_delta": {
              const delta = event.delta;
              if ((delta == null ? void 0 : delta.type) === "text_delta") {
                callbacks.onText(delta.text);
              } else if ((delta == null ? void 0 : delta.type) === "input_json_delta") {
                currentToolInputStr += delta.partial_json;
              }
              break;
            }
            case "content_block_stop": {
              if (currentToolName) {
                let input = {};
                try {
                  input = JSON.parse(currentToolInputStr || "{}");
                } catch (e) {
                }
                callbacks.onToolUse(currentToolId, currentToolName, input);
                currentToolName = "";
                currentToolId = "";
                currentToolInputStr = "";
              }
              break;
            }
            case "message_delta": {
              const delta = event.delta;
              if (delta == null ? void 0 : delta.stop_reason) {
                callbacks.onComplete(delta.stop_reason);
              }
              break;
            }
          }
        }
      }
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }
  async simpleMessage(params) {
    var _a;
    const { model, messages, system, tools, maxTokens } = params;
    const body = { model, messages, max_tokens: maxTokens };
    if (system)
      body.system = system;
    if (tools && tools.length > 0)
      body.tools = tools;
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(((_a = errBody == null ? void 0 : errBody.error) == null ? void 0 : _a.message) || `API error ${response.status}`);
    }
    const result = await response.json();
    const text = result.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const toolUses = result.content.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input }));
    return { text, stopReason: result.stop_reason, toolUses };
  }
};

// src/VaultTools.ts
var import_obsidian = require("obsidian");
function getVaultTools() {
  return [
    {
      name: "read_note",
      description: "Read the full content of a note in the user's Obsidian vault",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: 'Path to the note, e.g. "folder/note.md" or "note.md"' }
        },
        required: ["path"]
      }
    },
    {
      name: "search_vault",
      description: "Search for notes in the vault by filename or text content. Returns matching excerpts.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to search for" },
          limit: { type: "number", description: "Max results to return (default 8)" }
        },
        required: ["query"]
      }
    },
    {
      name: "create_or_update_note",
      description: "Create a new note or overwrite/append to an existing note",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: 'Path for the note, e.g. "folder/note.md"' },
          content: { type: "string", description: "Markdown content to write" },
          append: { type: "boolean", description: "If true, append to existing content instead of replacing" }
        },
        required: ["path", "content"]
      }
    },
    {
      name: "list_notes",
      description: "List notes in a vault folder",
      input_schema: {
        type: "object",
        properties: {
          folder: { type: "string", description: "Folder path (empty string for root)" },
          recursive: { type: "boolean", description: "Include subfolders (default true)" }
        }
      }
    },
    {
      name: "get_active_note",
      description: "Get the content of the note the user currently has open in Obsidian",
      input_schema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "get_vault_structure",
      description: "Get a tree overview of the vault folder structure",
      input_schema: {
        type: "object",
        properties: {
          depth: { type: "number", description: "How many folder levels deep (default 3)" }
        }
      }
    },
    {
      name: "delete_note",
      description: "Delete a note from the vault (moves to trash)",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the note to delete" }
        },
        required: ["path"]
      }
    },
    {
      name: "move_note",
      description: "Move or rename a note",
      input_schema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Current path of the note" },
          to: { type: "string", description: "New path for the note" }
        },
        required: ["from", "to"]
      }
    }
  ];
}
async function executeVaultTool(app, name, input) {
  const vault = app.vault;
  switch (name) {
    case "read_note": {
      const path = input.path;
      const file = findFile(vault, path);
      if (!file)
        return `Error: Note not found \u2014 tried "${path}" and "${path}.md"`;
      return await vault.read(file);
    }
    case "search_vault": {
      const query = input.query.toLowerCase();
      const limit = Math.min(input.limit || 8, 20);
      const files = vault.getMarkdownFiles();
      const results = [];
      for (const file of files) {
        if (results.length >= limit)
          break;
        const nameMatch = file.name.toLowerCase().includes(query);
        const content = await vault.read(file);
        const contentLower = content.toLowerCase();
        const contentMatch = contentLower.includes(query);
        if (nameMatch || contentMatch) {
          let excerpt = "";
          if (contentMatch) {
            const idx = contentLower.indexOf(query);
            const start = Math.max(0, idx - 80);
            excerpt = (start > 0 ? "..." : "") + content.slice(start, start + 300) + "...";
          } else {
            excerpt = content.slice(0, 200) + "...";
          }
          results.push({ path: file.path, excerpt: excerpt.replace(/\n+/g, " ") });
        }
      }
      if (results.length === 0)
        return `No notes found matching "${input.query}".`;
      return results.map((r) => `### ${r.path}
${r.excerpt}`).join("\n\n---\n\n");
    }
    case "create_or_update_note": {
      const path = normPath(input.path);
      const content = input.content;
      const append = input.append;
      await ensureFolders(vault, path);
      const existing = vault.getAbstractFileByPath(path);
      if (existing instanceof import_obsidian.TFile) {
        if (append) {
          const current = await vault.read(existing);
          await vault.modify(existing, current + "\n\n" + content);
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
    case "list_notes": {
      const folder = input.folder || "";
      const recursive = input.recursive !== false;
      const files = vault.getMarkdownFiles();
      const filtered = files.filter((f) => {
        var _a, _b;
        if (!folder)
          return true;
        const normalizedFolder = folder.endsWith("/") ? folder : folder + "/";
        if (recursive)
          return f.path.startsWith(normalizedFolder) || ((_a = f.parent) == null ? void 0 : _a.path) === folder;
        return ((_b = f.parent) == null ? void 0 : _b.path) === folder;
      });
      if (filtered.length === 0)
        return "No notes found in that folder.";
      return filtered.map((f) => f.path).sort().join("\n");
    }
    case "get_active_note": {
      const activeFile = app.workspace.getActiveFile();
      if (!activeFile)
        return "No note is currently open.";
      const content = await vault.read(activeFile);
      return `**Active note:** ${activeFile.path}

${content}`;
    }
    case "get_vault_structure": {
      const depth = Math.min(input.depth || 3, 5);
      const root = vault.getRoot();
      return buildTree(root, depth, 0);
    }
    case "delete_note": {
      const path = input.path;
      const file = findFile(vault, path);
      if (!file)
        return `Error: Note not found \u2014 "${path}"`;
      await vault.trash(file, true);
      return `Moved to trash: ${file.path}`;
    }
    case "move_note": {
      const from = input.from;
      const to = normPath(input.to);
      const file = findFile(vault, from);
      if (!file)
        return `Error: Source note not found \u2014 "${from}"`;
      await ensureFolders(vault, to);
      await app.fileManager.renameFile(file, to);
      return `Moved: ${file.path} \u2192 ${to}`;
    }
    default:
      return `Unknown vault tool: ${name}`;
  }
}
function findFile(vault, path) {
  let f = vault.getAbstractFileByPath(path);
  if (f instanceof import_obsidian.TFile)
    return f;
  f = vault.getAbstractFileByPath(path + ".md");
  if (f instanceof import_obsidian.TFile)
    return f;
  return null;
}
function normPath(path) {
  return path.endsWith(".md") ? path : path + ".md";
}
async function ensureFolders(vault, filePath) {
  const parts = filePath.split("/");
  if (parts.length <= 1)
    return;
  const folders = parts.slice(0, -1);
  let current = "";
  for (const part of folders) {
    current = current ? current + "/" + part : part;
    if (!vault.getAbstractFileByPath(current)) {
      await vault.createFolder(current);
    }
  }
}
function buildTree(folder, maxDepth, depth) {
  if (depth >= maxDepth)
    return "";
  const indent = "  ".repeat(depth);
  const lines = [];
  const sorted = [...folder.children].sort((a, b) => {
    const aIsFolder = a instanceof import_obsidian.TFolder ? 0 : 1;
    const bIsFolder = b instanceof import_obsidian.TFolder ? 0 : 1;
    return aIsFolder - bIsFolder || a.name.localeCompare(b.name);
  });
  for (const child of sorted) {
    if (child instanceof import_obsidian.TFolder) {
      lines.push(`${indent}\u{1F4C1} ${child.name}/`);
      const subtree = buildTree(child, maxDepth, depth + 1);
      if (subtree)
        lines.push(subtree);
    } else {
      lines.push(`${indent}\u{1F4C4} ${child.name}`);
    }
  }
  return lines.join("\n");
}

// src/CodeTools.ts
var import_child_process = require("child_process");
var import_util = require("util");
var import_fs = require("fs");
var import_path = require("path");
var execAsync = (0, import_util.promisify)(import_child_process.exec);
function getCodeTools() {
  return [
    {
      name: "run_command",
      description: "Execute a shell command and return stdout/stderr. Use PowerShell syntax on Windows.",
      input_schema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run" },
          cwd: { type: "string", description: "Working directory (optional)" },
          timeout: { type: "number", description: "Timeout in ms (default 30000)" }
        },
        required: ["command"]
      }
    },
    {
      name: "read_file",
      description: "Read a file from the filesystem (outside the vault)",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute file path" },
          encoding: { type: "string", description: "Encoding (default utf8)" }
        },
        required: ["path"]
      }
    },
    {
      name: "write_file",
      description: "Write content to a file on the filesystem",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute file path" },
          content: { type: "string", description: "Content to write" }
        },
        required: ["path", "content"]
      }
    },
    {
      name: "list_directory",
      description: "List files and directories at a path",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path" }
        },
        required: ["path"]
      }
    }
  ];
}
async function executeCodeTool(name, input) {
  switch (name) {
    case "run_command": {
      const command = input.command;
      const cwd = input.cwd || process.cwd();
      const timeout = input.timeout || 3e4;
      try {
        const { stdout, stderr } = await execAsync(command, { cwd, timeout });
        const out = stdout.trim();
        const err = stderr.trim();
        let result = "";
        if (out)
          result += `STDOUT:
${out}`;
        if (err)
          result += (result ? "\n\n" : "") + `STDERR:
${err}`;
        return result || "(no output)";
      } catch (e) {
        const err = e;
        return `Error: ${err.message || e}
${err.stderr || ""}`.trim();
      }
    }
    case "read_file": {
      const path = input.path;
      if (!(0, import_fs.existsSync)(path))
        return `Error: File not found: ${path}`;
      try {
        const content = (0, import_fs.readFileSync)(path, input.encoding || "utf8");
        return content;
      } catch (e) {
        return `Error reading file: ${e}`;
      }
    }
    case "write_file": {
      const path = input.path;
      const content = input.content;
      try {
        (0, import_fs.writeFileSync)(path, content, "utf8");
        return `Written: ${path}`;
      } catch (e) {
        return `Error writing file: ${e}`;
      }
    }
    case "list_directory": {
      const path = input.path;
      if (!(0, import_fs.existsSync)(path))
        return `Error: Directory not found: ${path}`;
      try {
        const entries = (0, import_fs.readdirSync)(path);
        return entries.map((name2) => {
          const full = (0, import_path.join)(path, name2);
          const isDir = (0, import_fs.statSync)(full).isDirectory();
          return isDir ? `\u{1F4C1} ${name2}/` : `\u{1F4C4} ${name2}`;
        }).join("\n");
      } catch (e) {
        return `Error listing directory: ${e}`;
      }
    }
    default:
      return `Unknown code tool: ${name}`;
  }
}

// src/CoworkManager.ts
var CoworkManager = class {
  constructor(client, app, model, maxTokens) {
    this.client = client;
    this.app = app;
    this.model = model;
    this.maxTokens = maxTokens;
  }
  async runCowork(task, onAgentUpdate, enableVaultTools) {
    const tools = enableVaultTools ? getVaultTools() : [];
    const agents = [
      {
        id: "researcher",
        name: "\u{1F50D} Researcher",
        role: "Thoroughly research the task and gather all relevant context",
        model: this.model,
        systemPrompt: [
          "You are a meticulous research agent. Your job is to thoroughly investigate the given task.",
          "Gather all relevant information, context, and details. Be comprehensive and thorough.",
          enableVaultTools ? "You have access to the user's Obsidian vault \u2014 use it to find relevant notes and context." : "",
          "Format your output as a structured research report."
        ].filter(Boolean).join("\n"),
        status: "idle"
      },
      {
        id: "critic",
        name: "\u{1F9D0} Critic",
        role: "Identify gaps, challenges, and alternative perspectives",
        model: this.model,
        systemPrompt: [
          "You are a critical analyst. You receive research findings and must:",
          "1. Identify gaps and missing information",
          "2. Challenge assumptions",
          "3. Find potential issues or edge cases",
          "4. Suggest alternative perspectives",
          "Be constructively critical \u2014 your goal is to improve the final output."
        ].join("\n"),
        status: "idle"
      },
      {
        id: "synthesizer",
        name: "\u2728 Synthesizer",
        role: "Combine insights into a final comprehensive response",
        model: this.model,
        systemPrompt: [
          "You are a synthesis agent. Given the original task, research findings, and critique:",
          "1. Integrate the best insights from all sources",
          "2. Address the critique points",
          "3. Produce a comprehensive, well-structured final response",
          "4. Use clear headings and formatting",
          "Your output IS the final answer the user will see."
        ].join("\n"),
        status: "idle"
      }
    ];
    const researcher = agents[0];
    researcher.status = "thinking";
    onAgentUpdate({ ...researcher });
    try {
      researcher.output = await this.runAgentWithTools(researcher, task, tools);
      researcher.status = "done";
    } catch (e) {
      researcher.output = `Error: ${e}`;
      researcher.status = "error";
    }
    onAgentUpdate({ ...researcher });
    const critic = agents[1];
    critic.status = "thinking";
    onAgentUpdate({ ...critic });
    const criticTask = `**Original task:** ${task}

**Research findings:**
${researcher.output || "(none)"}`;
    try {
      critic.output = await this.runAgentSimple(critic, criticTask);
      critic.status = "done";
    } catch (e) {
      critic.output = `Error: ${e}`;
      critic.status = "error";
    }
    onAgentUpdate({ ...critic });
    const synthesizer = agents[2];
    synthesizer.status = "thinking";
    onAgentUpdate({ ...synthesizer });
    const synthTask = [
      `**Original task:** ${task}`,
      `
**Research:**
${researcher.output || "(none)"}`,
      `
**Critique:**
${critic.output || "(none)"}`
    ].join("\n");
    try {
      synthesizer.output = await this.runAgentSimple(synthesizer, synthTask);
      synthesizer.status = "done";
    } catch (e) {
      synthesizer.output = `Error: ${e}`;
      synthesizer.status = "error";
    }
    onAgentUpdate({ ...synthesizer });
    return { agents, synthesis: synthesizer.output || "" };
  }
  async runAgentSimple(agent, task) {
    const result = await this.client.simpleMessage({
      model: agent.model,
      messages: [{ role: "user", content: task }],
      system: agent.systemPrompt,
      maxTokens: Math.min(this.maxTokens, 8096)
    });
    return result.text;
  }
  async runAgentWithTools(agent, task, tools) {
    const messages = [
      { role: "user", content: task }
    ];
    let finalText = "";
    let maxTurns = 6;
    while (maxTurns-- > 0) {
      const result = await this.client.simpleMessage({
        model: agent.model,
        messages,
        system: agent.systemPrompt,
        tools: tools.length > 0 ? tools : void 0,
        maxTokens: Math.min(this.maxTokens, 8096)
      });
      finalText = result.text;
      if (result.stopReason !== "tool_use" || result.toolUses.length === 0)
        break;
      const assistantContent = [];
      if (result.text)
        assistantContent.push({ type: "text", text: result.text });
      for (const tu of result.toolUses) {
        assistantContent.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
      }
      messages.push({ role: "assistant", content: assistantContent });
      const toolResults = [];
      for (const tu of result.toolUses) {
        const output = await executeVaultTool(this.app, tu.name, tu.input);
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: output });
      }
      messages.push({ role: "user", content: toolResults });
    }
    return finalText;
  }
};

// src/ChatView.ts
var VIEW_TYPE_CLAUDE = "claude-desktop-mirror";
var ClaudeView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.currentConv = null;
    this.conversations = [];
    this.isStreaming = false;
    this.plugin = plugin;
    this.client = new AnthropicClient(plugin.settings.apiKey);
  }
  getViewType() {
    return VIEW_TYPE_CLAUDE;
  }
  getDisplayText() {
    return "Claude";
  }
  getIcon() {
    return "bot";
  }
  async onOpen() {
    this.client = new AnthropicClient(this.plugin.settings.apiKey);
    this.buildUI();
    this.conversations = await this.plugin.store.loadAll();
    this.renderConvList();
    this.startNew();
  }
  async onClose() {
  }
  refreshClient() {
    this.client.setApiKey(this.plugin.settings.apiKey);
    this.updateModeOptions();
  }
  // ─── UI Build ────────────────────────────────────────────────────────────────
  buildUI() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("cdm-root");
    this.sidebarEl = root.createDiv({ cls: "cdm-sidebar" });
    this.buildSidebar();
    const main = root.createDiv({ cls: "cdm-main" });
    this.buildMain(main);
  }
  buildSidebar() {
    const hdr = this.sidebarEl.createDiv({ cls: "cdm-sidebar-hdr" });
    const brand = hdr.createDiv({ cls: "cdm-brand" });
    brand.createEl("span", { cls: "cdm-brand-icon", text: "C" });
    brand.createEl("span", { cls: "cdm-brand-name", text: "Claude" });
    const newBtn = hdr.createEl("button", { cls: "cdm-icon-btn", attr: { title: "New conversation" } });
    (0, import_obsidian2.setIcon)(newBtn, "square-pen");
    newBtn.addEventListener("click", () => this.startNew());
    this.convListEl = this.sidebarEl.createDiv({ cls: "cdm-conv-list" });
  }
  buildMain(main) {
    const topbar = main.createDiv({ cls: "cdm-topbar" });
    this.topbarTitleEl = topbar.createDiv({ cls: "cdm-topbar-title" });
    const controls = topbar.createDiv({ cls: "cdm-topbar-controls" });
    this.modelSelect = controls.createEl("select", { cls: "cdm-select" });
    [
      ["claude-haiku-4-5-20251001", "\u26A1 Haiku 4.5"],
      ["claude-sonnet-4-6", "\u2726 Sonnet 4.6"],
      ["claude-opus-4-8", "\u25C8 Opus 4.8"]
    ].forEach(([value, label]) => {
      const opt = this.modelSelect.createEl("option", { value, text: label });
      if (value === this.plugin.settings.defaultModel)
        opt.selected = true;
    });
    this.modelSelect.addEventListener("change", () => {
      if (this.currentConv)
        this.currentConv.model = this.modelSelect.value;
    });
    this.modeSelect = controls.createEl("select", { cls: "cdm-select" });
    this.updateModeOptions();
    this.modeSelect.addEventListener("change", () => {
      if (this.currentConv)
        this.currentConv.mode = this.modeSelect.value;
    });
    this.statusEl = topbar.createDiv({ cls: "cdm-status" });
    this.messagesEl = main.createDiv({ cls: "cdm-messages" });
    const inputArea = main.createDiv({ cls: "cdm-input-area" });
    const wrap = inputArea.createDiv({ cls: "cdm-input-wrap" });
    this.inputEl = wrap.createEl("textarea", {
      cls: "cdm-input",
      attr: { placeholder: "Message Claude\u2026", rows: "1" }
    });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });
    this.inputEl.addEventListener("input", () => this.autoResize());
    this.sendBtn = wrap.createEl("button", { cls: "cdm-send-btn", attr: { title: "Send" } });
    (0, import_obsidian2.setIcon)(this.sendBtn, "send");
    this.sendBtn.addEventListener("click", () => this.send());
    inputArea.createEl("p", {
      text: "Claude can make mistakes. Vault tools enabled.",
      cls: "cdm-footer-note"
    });
  }
  updateModeOptions() {
    if (!this.modeSelect)
      return;
    const current = this.modeSelect.value;
    this.modeSelect.empty();
    this.modeSelect.createEl("option", { value: "chat", text: "\u{1F4AC} Chat" });
    if (this.plugin.settings.enableCowork)
      this.modeSelect.createEl("option", { value: "cowork", text: "\u{1F91D} Co-work" });
    if (this.plugin.settings.enableCodeMode)
      this.modeSelect.createEl("option", { value: "code", text: "\u{1F4BB} Code" });
    if (current)
      this.modeSelect.value = current;
  }
  // ─── Conversation List ────────────────────────────────────────────────────────
  renderConvList() {
    var _a;
    this.convListEl.empty();
    if (this.conversations.length === 0) {
      this.convListEl.createEl("p", { text: "No conversations yet", cls: "cdm-conv-empty" });
      return;
    }
    const today = (/* @__PURE__ */ new Date()).toDateString();
    const yesterday = new Date(Date.now() - 864e5).toDateString();
    let lastGroup = "";
    for (const conv of this.conversations) {
      const d = new Date(conv.updatedAt);
      const group = d.toDateString() === today ? "Today" : d.toDateString() === yesterday ? "Yesterday" : d.toLocaleDateString(void 0, { month: "short", day: "numeric" });
      if (group !== lastGroup) {
        this.convListEl.createEl("div", { text: group, cls: "cdm-conv-group" });
        lastGroup = group;
      }
      const item = this.convListEl.createDiv({ cls: "cdm-conv-item" });
      if (conv.id === ((_a = this.currentConv) == null ? void 0 : _a.id))
        item.addClass("active");
      const modeEmoji = conv.mode === "cowork" ? "\u{1F91D} " : conv.mode === "code" ? "\u{1F4BB} " : "";
      item.createEl("span", { text: modeEmoji + conv.title, cls: "cdm-conv-title" });
      item.addEventListener("click", () => this.loadConv(conv));
      const del = item.createEl("button", { cls: "cdm-conv-del", attr: { title: "Delete" } });
      (0, import_obsidian2.setIcon)(del, "trash-2");
      del.addEventListener("click", async (e) => {
        var _a2;
        e.stopPropagation();
        await this.plugin.store.delete(conv.id);
        this.conversations = this.conversations.filter((c) => c.id !== conv.id);
        if (((_a2 = this.currentConv) == null ? void 0 : _a2.id) === conv.id)
          this.startNew();
        this.renderConvList();
      });
    }
  }
  startNew() {
    var _a, _b, _c;
    const mode = ((_a = this.modeSelect) == null ? void 0 : _a.value) || "chat";
    const model = ((_b = this.modelSelect) == null ? void 0 : _b.value) || this.plugin.settings.defaultModel;
    this.currentConv = this.plugin.store.create(model, mode);
    (_c = this.messagesEl) == null ? void 0 : _c.empty();
    this.renderWelcome();
    this.renderConvList();
    this.topbarTitleEl && (this.topbarTitleEl.textContent = "");
  }
  loadConv(conv) {
    this.currentConv = conv;
    if (this.modelSelect)
      this.modelSelect.value = conv.model;
    if (this.modeSelect)
      this.modeSelect.value = conv.mode;
    if (this.topbarTitleEl)
      this.topbarTitleEl.textContent = conv.title;
    this.messagesEl.empty();
    this.renderAllMessages();
    this.renderConvList();
  }
  // ─── Welcome ─────────────────────────────────────────────────────────────────
  renderWelcome() {
    var _a;
    const el = this.messagesEl.createDiv({ cls: "cdm-welcome" });
    el.createEl("div", { cls: "cdm-welcome-logo", text: "C" });
    el.createEl("h2", { text: "How can I help you today?" });
    const mode = ((_a = this.modeSelect) == null ? void 0 : _a.value) || "chat";
    if (mode === "cowork") {
      el.createEl("p", { text: "\u{1F91D} Co-work mode \u2014 a team of agents (Researcher, Critic, Synthesizer) will collaborate on your request." });
    } else if (mode === "code") {
      el.createEl("p", { text: "\u{1F4BB} Code mode \u2014 I can run shell commands, read and write files, and help with technical tasks." });
    } else if (this.plugin.settings.enableVaultTools) {
      el.createEl("p", { text: "I have access to your vault and can read, search, and write notes." });
    }
  }
  // ─── Sending ──────────────────────────────────────────────────────────────────
  async send() {
    if (!this.currentConv || this.isStreaming)
      return;
    const text = this.inputEl.value.trim();
    if (!text)
      return;
    this.inputEl.value = "";
    this.autoResize();
    const mode = this.modeSelect.value;
    if (mode === "cowork" && this.plugin.settings.enableCowork) {
      await this.runCowork(text);
    } else {
      await this.runChat(text);
    }
  }
  // ─── Chat ────────────────────────────────────────────────────────────────────
  async runChat(text) {
    var _a;
    if (!this.currentConv)
      return;
    (_a = this.messagesEl.querySelector(".cdm-welcome")) == null ? void 0 : _a.remove();
    this.isStreaming = true;
    this.sendBtn.disabled = true;
    const userMsg = this.addMessage("user", text);
    this.renderConvList();
    if (this.currentConv.messages.length === 1) {
      const title = text.slice(0, 52) + (text.length > 52 ? "\u2026" : "");
      this.currentConv.title = title;
      if (this.topbarTitleEl)
        this.topbarTitleEl.textContent = title;
    }
    const tools = [
      ...this.plugin.settings.enableVaultTools ? getVaultTools() : [],
      ...this.modeSelect.value === "code" && this.plugin.settings.enableCodeMode ? getCodeTools() : []
    ];
    const system = this.buildSystem();
    this.setStatus("Thinking\u2026");
    const { wrap: assistantWrap, bubble } = this.createMessageBubble("assistant");
    const streamEl = bubble.createDiv({ cls: "cdm-stream" });
    let streamText = "";
    const pendingToolUses = [];
    try {
      await this.client.streamMessage({
        model: this.currentConv.model,
        messages: this.buildApiMessages(),
        system,
        tools: tools.length > 0 ? tools : void 0,
        maxTokens: this.plugin.settings.maxTokens,
        callbacks: {
          onText: (chunk) => {
            streamText += chunk;
            streamEl.empty();
            import_obsidian2.MarkdownRenderer.render(this.app, streamText, streamEl, "", this);
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
          onError: (err) => {
            streamEl.empty();
            streamEl.createEl("p", { text: `\u274C ${err.message}`, cls: "cdm-error" });
            this.done();
          }
        }
      });
    } catch (e) {
      new import_obsidian2.Notice(`Claude error: ${e}`);
      this.done();
    }
  }
  async handleToolUses(precedingText, toolUses, bubble, tools, system) {
    if (!this.currentConv)
      return;
    const assistantContent = [];
    if (precedingText)
      assistantContent.push({ type: "text", text: precedingText });
    for (const tu of toolUses) {
      assistantContent.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
      this.renderToolUse(bubble, tu.name, tu.input);
    }
    this.currentConv.messages.push({
      id: `msg_${Date.now()}_a`,
      role: "assistant",
      content: assistantContent,
      timestamp: Date.now()
    });
    this.setStatus("Running tools\u2026");
    const toolResults = [];
    for (const tu of toolUses) {
      const result = tu.name.startsWith("run_command") || tu.name === "read_file" || tu.name === "write_file" || tu.name === "list_directory" ? await executeCodeTool(tu.name, tu.input) : await executeVaultTool(this.app, tu.name, tu.input);
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
      this.renderToolResult(bubble, result);
    }
    this.currentConv.messages.push({
      id: `msg_${Date.now()}_tr`,
      role: "user",
      content: toolResults,
      timestamp: Date.now()
    });
    this.setStatus("Continuing\u2026");
    const continueEl = bubble.createDiv({ cls: "cdm-stream" });
    let continueText = "";
    await this.client.streamMessage({
      model: this.currentConv.model,
      messages: this.buildApiMessages(),
      system,
      tools: tools.length > 0 ? tools : void 0,
      maxTokens: this.plugin.settings.maxTokens,
      callbacks: {
        onText: (chunk) => {
          continueText += chunk;
          continueEl.empty();
          import_obsidian2.MarkdownRenderer.render(this.app, continueText, continueEl, "", this);
          this.scrollBottom();
        },
        onToolUse: () => {
        },
        onComplete: () => this.finalizeMessage(continueText),
        onError: (err) => {
          continueEl.createEl("p", { text: `\u274C ${err.message}`, cls: "cdm-error" });
          this.done();
        }
      }
    });
  }
  finalizeMessage(text) {
    if (!this.currentConv)
      return;
    this.currentConv.messages.push({
      id: `msg_${Date.now()}_f`,
      role: "assistant",
      content: text,
      timestamp: Date.now()
    });
    this.plugin.store.save(this.currentConv);
    if (this.plugin.settings.autoExportChats) {
      this.plugin.exporter.export(this.currentConv).catch(() => {
      });
    }
    if (!this.conversations.find((c) => c.id === this.currentConv.id)) {
      this.conversations.unshift(this.currentConv);
    }
    this.renderConvList();
    this.done();
  }
  // ─── Co-work ─────────────────────────────────────────────────────────────────
  async runCowork(task) {
    var _a;
    if (!this.currentConv)
      return;
    (_a = this.messagesEl.querySelector(".cdm-welcome")) == null ? void 0 : _a.remove();
    this.isStreaming = true;
    this.sendBtn.disabled = true;
    this.addMessage("user", task);
    if (this.currentConv.messages.length === 1) {
      this.currentConv.title = "\u{1F91D} " + task.slice(0, 48);
      if (this.topbarTitleEl)
        this.topbarTitleEl.textContent = this.currentConv.title;
    }
    const panel = this.messagesEl.createDiv({ cls: "cdm-cowork-panel" });
    panel.createEl("h3", { text: "\u{1F91D} Co-work Session", cls: "cdm-cowork-heading" });
    const agentsContainer = panel.createDiv({ cls: "cdm-cowork-agents" });
    const agentEls = /* @__PURE__ */ new Map();
    const onAgentUpdate = (agent) => {
      if (!agentEls.has(agent.id)) {
        const el = agentsContainer.createDiv({ cls: "cdm-agent" });
        const hdr = el.createDiv({ cls: "cdm-agent-hdr" });
        hdr.createEl("span", { text: agent.name, cls: "cdm-agent-name" });
        const statusEl2 = hdr.createEl("span", { cls: "cdm-agent-status" });
        el.createEl("p", { text: agent.role, cls: "cdm-agent-role" });
        const outputEl2 = el.createDiv({ cls: "cdm-agent-output" });
        agentEls.set(agent.id, { statusEl: statusEl2, outputEl: outputEl2 });
      }
      const { statusEl, outputEl } = agentEls.get(agent.id);
      statusEl.className = `cdm-agent-status cdm-agent-${agent.status}`;
      statusEl.textContent = agent.status === "thinking" ? "\u27F3 Working\u2026" : agent.status === "done" ? "\u2713 Done" : agent.status === "error" ? "\u2717 Error" : "";
      if (agent.output) {
        outputEl.empty();
        import_obsidian2.MarkdownRenderer.render(this.app, agent.output, outputEl, "", this);
      }
      this.scrollBottom();
    };
    const manager = new CoworkManager(
      this.client,
      this.app,
      this.currentConv.model,
      this.plugin.settings.maxTokens
    );
    this.setStatus("Co-work in progress\u2026");
    try {
      const result = await manager.runCowork(
        task,
        onAgentUpdate,
        this.plugin.settings.enableVaultTools
      );
      const synthEl = panel.createDiv({ cls: "cdm-cowork-synthesis" });
      synthEl.createEl("h3", { text: "\u{1F4CB} Final Answer", cls: "cdm-synthesis-heading" });
      const synthContent = synthEl.createDiv();
      import_obsidian2.MarkdownRenderer.render(this.app, result.synthesis, synthContent, "", this);
      this.currentConv.messages.push({
        id: `msg_${Date.now()}_cw`,
        role: "assistant",
        content: `**Co-work Result**

${result.synthesis}`,
        timestamp: Date.now()
      });
      await this.plugin.store.save(this.currentConv);
      if (this.plugin.settings.autoExportChats) {
        this.plugin.exporter.export(this.currentConv).catch(() => {
        });
      }
      if (!this.conversations.find((c) => c.id === this.currentConv.id)) {
        this.conversations.unshift(this.currentConv);
      }
      this.renderConvList();
    } catch (e) {
      panel.createEl("p", { text: `\u274C Co-work error: ${e}`, cls: "cdm-error" });
      new import_obsidian2.Notice(`Co-work error: ${e}`);
    } finally {
      this.done();
      this.scrollBottom();
    }
  }
  // ─── Message Rendering ────────────────────────────────────────────────────────
  addMessage(role, text) {
    const msg = {
      id: `msg_${Date.now()}`,
      role,
      content: text,
      timestamp: Date.now()
    };
    this.currentConv.messages.push(msg);
    this.renderMessage(msg);
    this.scrollBottom();
    return msg;
  }
  renderAllMessages() {
    if (!this.currentConv)
      return;
    for (const msg of this.currentConv.messages) {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        const hasOnlyToolResults = msg.content.every((b) => b.type === "tool_result");
        if (hasOnlyToolResults)
          continue;
      }
      this.renderMessage(msg);
    }
    this.scrollBottom();
  }
  renderMessage(msg) {
    const { wrap, bubble } = this.createMessageBubble(msg.role);
    if (typeof msg.content === "string") {
      import_obsidian2.MarkdownRenderer.render(this.app, msg.content, bubble, "", this);
    } else {
      for (const block of msg.content) {
        if (block.type === "text" && block.text) {
          import_obsidian2.MarkdownRenderer.render(this.app, block.text, bubble, "", this);
        } else if (block.type === "tool_use") {
          this.renderToolUse(bubble, block.name, block.input);
        } else if (block.type === "tool_result") {
          this.renderToolResult(bubble, block.content);
        }
      }
    }
    if (msg.role === "assistant")
      this.addCopyBtn(wrap, msg);
    return wrap;
  }
  createMessageBubble(role) {
    const wrap = this.messagesEl.createDiv({ cls: `cdm-msg cdm-msg-${role}` });
    if (role === "assistant") {
      const av = wrap.createDiv({ cls: "cdm-avatar" });
      av.createEl("span", { text: "C" });
    }
    const bubble = wrap.createDiv({ cls: "cdm-bubble" });
    return { wrap, bubble };
  }
  renderToolUse(container, name, input) {
    const el = container.createDiv({ cls: "cdm-tool-call" });
    const hdr = el.createDiv({ cls: "cdm-tool-hdr" });
    const iconSpan = hdr.createSpan();
    (0, import_obsidian2.setIcon)(iconSpan, "terminal");
    hdr.createEl("span", { text: ` ${name}`, cls: "cdm-tool-name" });
    const det = el.createEl("details");
    det.createEl("summary", { text: "Input" });
    det.createEl("pre", { text: JSON.stringify(input, null, 2), cls: "cdm-tool-json" });
  }
  renderToolResult(container, result) {
    const el = container.createDiv({ cls: "cdm-tool-result" });
    const hdr = el.createDiv({ cls: "cdm-tool-result-hdr" });
    const iconSpan = hdr.createSpan();
    (0, import_obsidian2.setIcon)(iconSpan, "check-circle-2");
    hdr.createEl("span", { text: " Result" });
    const det = el.createEl("details");
    det.createEl("summary", { text: "Output" });
    const preview = result.length > 3e3 ? result.slice(0, 3e3) + "\n\n\u2026(truncated)" : result;
    det.createEl("pre", { text: preview, cls: "cdm-tool-output" });
  }
  addCopyBtn(wrap, msg) {
    const actions = wrap.createDiv({ cls: "cdm-msg-actions" });
    const btn = actions.createEl("button", { cls: "cdm-icon-btn-sm", attr: { title: "Copy" } });
    (0, import_obsidian2.setIcon)(btn, "copy");
    btn.addEventListener("click", () => {
      const text = typeof msg.content === "string" ? msg.content : msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      navigator.clipboard.writeText(text);
      new import_obsidian2.Notice("Copied");
    });
  }
  // ─── Helpers ──────────────────────────────────────────────────────────────────
  buildApiMessages() {
    if (!this.currentConv)
      return [];
    const result = [];
    for (const msg of this.currentConv.messages) {
      if (typeof msg.content === "string") {
        result.push({ role: msg.role, content: msg.content });
      } else {
        result.push({ role: msg.role, content: msg.content });
      }
    }
    return result;
  }
  buildSystem() {
    var _a;
    const parts = [];
    if (this.plugin.settings.systemPrompt)
      parts.push(this.plugin.settings.systemPrompt);
    if (this.plugin.settings.enableVaultTools) {
      parts.push(
        "You have access to the user's Obsidian vault through tools. Use them proactively when the user asks about their notes, wants to create or edit content, or when vault context would help you answer better."
      );
    }
    const mode = (_a = this.modeSelect) == null ? void 0 : _a.value;
    if (mode === "code") {
      parts.push(
        "You are in Code Mode. You have access to shell command execution (run_command), file read/write, and directory listing tools in addition to vault tools. Be precise and careful with commands."
      );
    }
    return parts.join("\n\n");
  }
  setStatus(text) {
    if (this.statusEl)
      this.statusEl.textContent = text;
  }
  done() {
    this.isStreaming = false;
    this.sendBtn.disabled = false;
    this.setStatus("");
  }
  scrollBottom() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
  autoResize() {
    this.inputEl.style.height = "auto";
    this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 180) + "px";
  }
};

// src/settings.ts
var import_obsidian3 = require("obsidian");

// src/SystemPromptSync.ts
var import_fs2 = require("fs");
var import_os = require("os");
var import_path2 = require("path");
var DEFAULT_SYNC_PATH = (0, import_path2.join)((0, import_os.homedir)(), ".claude", "system-prompt.md");
var TEMPLATE = `# Claude System Prompt

This file is shared between Claude Desktop Mirror (Obsidian) and Claude Code.
Edit it here, then click "Load from File" in Obsidian's Claude Desktop Mirror settings,
or enable Auto-Sync to pick it up automatically on startup.

---

You are a helpful assistant with deep knowledge of my work and Obsidian vault.
`;
var SystemPromptSync = class {
  constructor() {
    this.watcher = null;
    this.watchPath = null;
  }
  read(filePath) {
    if (!(0, import_fs2.existsSync)(filePath))
      return "";
    return (0, import_fs2.readFileSync)(filePath, "utf8").trim();
  }
  write(filePath, content) {
    const dir = (0, import_path2.dirname)(filePath);
    if (!(0, import_fs2.existsSync)(dir))
      (0, import_fs2.mkdirSync)(dir, { recursive: true });
    (0, import_fs2.writeFileSync)(filePath, content, "utf8");
  }
  ensureTemplate(filePath) {
    if ((0, import_fs2.existsSync)(filePath))
      return false;
    this.write(filePath, TEMPLATE);
    return true;
  }
  startWatch(filePath, onChange) {
    this.stopWatch();
    this.watchPath = filePath;
    (0, import_fs2.watchFile)(filePath, { interval: 2e3 }, () => {
      const content = this.read(filePath);
      onChange(content);
    });
  }
  stopWatch() {
    if (this.watchPath) {
      (0, import_fs2.unwatchFile)(this.watchPath);
      this.watchPath = null;
    }
  }
};

// src/settings.ts
var DEFAULT_SETTINGS = {
  apiKey: "",
  defaultModel: "claude-sonnet-4-6",
  conversationsFolder: "Claude Conversations",
  systemPrompt: "",
  enableVaultTools: true,
  enableCodeMode: false,
  enableCowork: true,
  maxTokens: 8096,
  syncFilePath: DEFAULT_SYNC_PATH,
  autoSyncOnStartup: true,
  autoExportChats: true,
  exportFolder: "Claude Conversations/Exports"
};
var ClaudeSettingsTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.sync = new SystemPromptSync();
    this.promptTextArea = null;
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Claude Desktop Mirror" });
    new import_obsidian3.Setting(containerEl).setName("API Key").setDesc("Your Anthropic API key (stored in Obsidian data only)").addText(
      (text) => text.setPlaceholder("sk-ant-...").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
        this.plugin.settings.apiKey = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Default Model").setDesc("Default Claude model for new conversations").addDropdown(
      (drop) => drop.addOption("claude-haiku-4-5-20251001", "Haiku 4.5 (Fast & cheap)").addOption("claude-sonnet-4-6", "Sonnet 4.6 (Balanced)").addOption("claude-opus-4-8", "Opus 4.8 (Most powerful)").setValue(this.plugin.settings.defaultModel).onChange(async (value) => {
        this.plugin.settings.defaultModel = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Conversations Folder").setDesc("Vault folder where conversations are saved").addText(
      (text) => text.setPlaceholder("Claude Conversations").setValue(this.plugin.settings.conversationsFolder).onChange(async (value) => {
        this.plugin.settings.conversationsFolder = value || "Claude Conversations";
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "System Prompt" });
    const promptSetting = new import_obsidian3.Setting(containerEl).setName("System Prompt").setDesc("Applied to all conversations. Syncs with the file below.");
    promptSetting.addTextArea((text) => {
      text.setPlaceholder("You are a helpful assistant\u2026").setValue(this.plugin.settings.systemPrompt).onChange(async (value) => {
        this.plugin.settings.systemPrompt = value;
        await this.plugin.saveSettings();
      });
      text.inputEl.rows = 7;
      text.inputEl.style.width = "100%";
      text.inputEl.style.fontFamily = "var(--font-monospace)";
      text.inputEl.style.fontSize = "12px";
      this.promptTextArea = text.inputEl;
      return text;
    });
    containerEl.createEl("h3", { text: "System Prompt Sync" });
    const syncDesc = containerEl.createEl("p", { cls: "setting-item-description" });
    syncDesc.innerHTML = "Sync your system prompt with a shared file at <code>" + this.plugin.settings.syncFilePath + "</code>. This file is read by Claude Code and can be updated from Claude Desktop's custom instructions manually. Use the buttons below to push/pull between Obsidian and the file.";
    new import_obsidian3.Setting(containerEl).setName("Sync File Path").setDesc("Absolute path to the shared system prompt file").addText(
      (text) => text.setPlaceholder(DEFAULT_SYNC_PATH).setValue(this.plugin.settings.syncFilePath).onChange(async (value) => {
        this.plugin.settings.syncFilePath = value.trim() || DEFAULT_SYNC_PATH;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Auto-sync on Startup").setDesc("Load the system prompt from the sync file when Obsidian starts").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoSyncOnStartup).onChange(async (value) => {
        this.plugin.settings.autoSyncOnStartup = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Load from File").setDesc("Overwrite the system prompt above with the contents of the sync file").addButton(
      (btn) => btn.setButtonText("\u2B07 Load").setTooltip("Read from file \u2192 Obsidian").onClick(async () => {
        const path = this.plugin.settings.syncFilePath;
        this.sync.ensureTemplate(path);
        const content = this.sync.read(path);
        if (!content) {
          new import_obsidian3.Notice("Sync file is empty or not found.");
          return;
        }
        this.plugin.settings.systemPrompt = content;
        await this.plugin.saveSettings();
        if (this.promptTextArea)
          this.promptTextArea.value = content;
        new import_obsidian3.Notice("System prompt loaded from file \u2713");
      })
    ).addButton(
      (btn) => btn.setButtonText("\u2B06 Save to File").setTooltip("Write Obsidian prompt \u2192 file").onClick(async () => {
        const path = this.plugin.settings.syncFilePath;
        const content = this.plugin.settings.systemPrompt;
        this.sync.write(path, content);
        new import_obsidian3.Notice(`Saved to ${path} \u2713`);
      })
    ).addButton(
      (btn) => btn.setButtonText("\u{1F4C4} Open File").setTooltip("Open sync file in your editor").onClick(() => {
        const path = this.plugin.settings.syncFilePath;
        this.sync.ensureTemplate(path);
        try {
          const { shell } = require("electron");
          shell.openPath(path);
        } catch (e) {
          new import_obsidian3.Notice(`Open manually: ${path}`);
        }
      })
    );
    const statusEl = containerEl.createEl("p", { cls: "cdm-sync-status" });
    this.updateSyncStatus(statusEl);
    containerEl.createEl("h3", { text: "Chat History Export" });
    new import_obsidian3.Setting(containerEl).setName("Auto-export Conversations").setDesc("After each reply, write the conversation as a readable markdown note in your vault").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoExportChats).onChange(async (value) => {
        this.plugin.settings.autoExportChats = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Export Folder").setDesc("Vault folder where markdown exports are written").addText(
      (text) => text.setPlaceholder("Claude Conversations/Exports").setValue(this.plugin.settings.exportFolder).onChange(async (value) => {
        this.plugin.settings.exportFolder = value || "Claude Conversations/Exports";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Export All Now").setDesc("Write all existing conversations to markdown in the export folder").addButton(
      (btn) => btn.setButtonText("Export All").onClick(async () => {
        btn.setButtonText("Exporting\u2026");
        btn.buttonEl.disabled = true;
        try {
          const convs = await this.plugin.store.loadAll();
          const count = await this.plugin.exporter.exportAll(convs);
          new import_obsidian3.Notice(`Exported ${count} conversation${count !== 1 ? "s" : ""} \u2713`);
        } catch (e) {
          new import_obsidian3.Notice(`Export error: ${e}`);
        } finally {
          btn.setButtonText("Export All");
          btn.buttonEl.disabled = false;
        }
      })
    );
    containerEl.createEl("h3", { text: "Features" });
    new import_obsidian3.Setting(containerEl).setName("Vault Tools").setDesc("Claude can read, search, create, and edit notes in your vault").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableVaultTools).onChange(async (value) => {
        this.plugin.settings.enableVaultTools = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Co-work Mode").setDesc("Multi-agent sessions: Researcher \u2192 Critic \u2192 Synthesizer").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableCowork).onChange(async (value) => {
        this.plugin.settings.enableCowork = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Code Mode").setDesc("Shell command execution, file read/write, directory listing").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableCodeMode).onChange(async (value) => {
        this.plugin.settings.enableCodeMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Max Tokens").setDesc(`Maximum tokens per response (current: ${this.plugin.settings.maxTokens})`).addSlider(
      (slider) => slider.setLimits(1024, 32e3, 1024).setValue(this.plugin.settings.maxTokens).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.maxTokens = value;
        await this.plugin.saveSettings();
      })
    );
  }
  updateSyncStatus(el) {
    const path = this.plugin.settings.syncFilePath;
    const { existsSync: existsSync3 } = require("fs");
    if (existsSync3(path)) {
      const { statSync: statSync2 } = require("fs");
      const mtime = statSync2(path).mtime;
      el.textContent = `\u2713 Sync file found \u2014 last modified ${mtime.toLocaleString()}`;
      el.style.color = "var(--color-green, #4caf50)";
    } else {
      el.textContent = `\u26A0 Sync file not yet created \u2014 click "Save to File" or "Open File" to create it`;
      el.style.color = "var(--color-yellow, #e8a000)";
    }
    el.style.fontSize = "12px";
    el.style.marginTop = "4px";
  }
};

// src/ConversationStore.ts
var import_obsidian4 = require("obsidian");
var ConversationStore = class {
  constructor(app, folder) {
    this.app = app;
    this.folder = folder;
    this.cache = /* @__PURE__ */ new Map();
  }
  setFolder(folder) {
    this.folder = folder;
  }
  async ensureFolder() {
    if (!this.app.vault.getAbstractFileByPath(this.folder)) {
      await this.app.vault.createFolder(this.folder);
    }
  }
  filePath(id) {
    return (0, import_obsidian4.normalizePath)(`${this.folder}/${id}.json`);
  }
  async save(conv) {
    await this.ensureFolder();
    conv.updatedAt = Date.now();
    const content = JSON.stringify(conv, null, 2);
    const path = this.filePath(conv.id);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian4.TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
    this.cache.set(conv.id, conv);
  }
  async loadAll() {
    await this.ensureFolder();
    const files = this.app.vault.getFiles().filter((f) => f.path.startsWith(this.folder + "/") && f.extension === "json");
    const results = [];
    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const conv = JSON.parse(content);
        this.cache.set(conv.id, conv);
        results.push(conv);
      } catch (e) {
      }
    }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async delete(id) {
    const path = this.filePath(id);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian4.TFile)
      await this.app.vault.trash(file, true);
    this.cache.delete(id);
  }
  get(id) {
    return this.cache.get(id);
  }
  create(model, mode) {
    const now = Date.now();
    const conv = {
      id: `conv_${now}_${Math.random().toString(36).slice(2, 7)}`,
      title: "New Conversation",
      messages: [],
      model,
      mode,
      createdAt: now,
      updatedAt: now
    };
    this.cache.set(conv.id, conv);
    return conv;
  }
};

// src/ChatExporter.ts
var import_obsidian5 = require("obsidian");
var ChatExporter = class {
  constructor(app, exportFolder) {
    this.app = app;
    this.exportFolder = exportFolder;
  }
  setFolder(folder) {
    this.exportFolder = folder;
  }
  async export(conv) {
    await this.ensureFolder();
    const md = this.toMarkdown(conv);
    const safe = conv.title.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
    const path = (0, import_obsidian5.normalizePath)(`${this.exportFolder}/${safe}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian5.TFile) {
      await this.app.vault.modify(existing, md);
    } else {
      await this.app.vault.create(path, md);
    }
    return path;
  }
  async exportAll(conversations) {
    let count = 0;
    for (const conv of conversations) {
      if (conv.messages.length > 0) {
        await this.export(conv);
        count++;
      }
    }
    return count;
  }
  toMarkdown(conv) {
    const date = new Date(conv.createdAt).toLocaleDateString(void 0, {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const updated = new Date(conv.updatedAt).toLocaleString();
    const modeLabel = conv.mode === "cowork" ? "Co-work" : conv.mode === "code" ? "Code" : "Chat";
    const modelLabel = conv.model.replace("claude-", "").replace("-20251001", "").replace(/-/g, " ");
    const lines = [
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
      `> **Model:** ${modelLabel} \xB7 **Mode:** ${modeLabel} \xB7 **Started:** ${date}`,
      ``,
      `---`,
      ``
    ];
    const visible = conv.messages.filter((msg) => {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        return !msg.content.every((b) => b.type === "tool_result");
      }
      return true;
    });
    for (const msg of visible) {
      lines.push(...this.renderMessage(msg));
      lines.push("");
    }
    return lines.join("\n");
  }
  renderMessage(msg) {
    const lines = [];
    const time = new Date(msg.timestamp).toLocaleTimeString(void 0, {
      hour: "2-digit",
      minute: "2-digit"
    });
    if (msg.role === "user") {
      lines.push(`## \u{1F9D1} You  <small>${time}</small>`);
      lines.push("");
      lines.push(this.contentToText(msg.content));
    } else {
      lines.push(`## \u{1F916} Claude  <small>${time}</small>`);
      lines.push("");
      lines.push(this.contentToText(msg.content));
    }
    return lines;
  }
  contentToText(content) {
    if (typeof content === "string")
      return content;
    const parts = [];
    for (const block of content) {
      if (block.type === "text" && block.text) {
        parts.push(block.text);
      } else if (block.type === "tool_use") {
        parts.push(
          `\`\`\`tool-call
tool: ${block.name}
input: ${JSON.stringify(block.input, null, 2)}
\`\`\``
        );
      } else if (block.type === "tool_result") {
        const result = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
        const preview = result.length > 500 ? result.slice(0, 500) + "\n\u2026(truncated)" : result;
        parts.push(`\`\`\`tool-result
${preview}
\`\`\``);
      }
    }
    return parts.join("\n\n");
  }
  async ensureFolder() {
    if (!this.app.vault.getAbstractFileByPath(this.exportFolder)) {
      await this.app.vault.createFolder(this.exportFolder);
    }
  }
};

// src/main.ts
var ClaudeDesktopMirror = class extends import_obsidian6.Plugin {
  constructor() {
    super(...arguments);
    this.promptSync = new SystemPromptSync();
  }
  async onload() {
    await this.loadSettings();
    this.store = new ConversationStore(this.app, this.settings.conversationsFolder);
    this.exporter = new ChatExporter(this.app, this.settings.exportFolder);
    if (this.settings.autoSyncOnStartup && this.settings.syncFilePath) {
      this.app.workspace.onLayoutReady(() => this.autoSyncPrompt());
    }
    this.registerView(VIEW_TYPE_CLAUDE, (leaf) => new ClaudeView(leaf, this));
    this.addRibbonIcon("bot", "Claude Desktop Mirror", () => this.openView());
    this.addCommand({
      id: "open-claude",
      name: "Open Claude",
      callback: () => this.openView()
    });
    this.addCommand({
      id: "claude-new-conversation",
      name: "New Claude Conversation",
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
      }
    });
    this.addCommand({
      id: "claude-export-all",
      name: "Export All Claude Conversations to Markdown",
      callback: async () => {
        const convs = await this.store.loadAll();
        const count = await this.exporter.exportAll(convs);
        new import_obsidian6.Notice(`Exported ${count} conversation${count !== 1 ? "s" : ""} \u2713`);
      }
    });
    this.addCommand({
      id: "claude-sync-prompt",
      name: "Sync System Prompt from File",
      callback: async () => {
        const path = this.settings.syncFilePath;
        const content = this.promptSync.read(path);
        if (!content) {
          new import_obsidian6.Notice("Sync file is empty or missing.");
          return;
        }
        this.settings.systemPrompt = content;
        await this.saveSettings();
        new import_obsidian6.Notice("System prompt synced \u2713");
      }
    });
    this.addSettingTab(new ClaudeSettingsTab(this.app, this));
  }
  async onunload() {
    this.promptSync.stopWatch();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CLAUDE);
  }
  async autoSyncPrompt() {
    const path = this.settings.syncFilePath;
    const content = this.promptSync.read(path);
    if (content && content !== this.settings.systemPrompt) {
      this.settings.systemPrompt = content;
      await this.saveData(this.settings);
      new import_obsidian6.Notice("Claude: system prompt synced from file", 3e3);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    var _a;
    await this.saveData(this.settings);
    this.store.setFolder(this.settings.conversationsFolder);
    this.exporter.setFolder(this.settings.exportFolder);
    (_a = this.getActiveView()) == null ? void 0 : _a.refreshClient();
  }
  async openView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE);
    if (leaves.length > 0) {
      this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_CLAUDE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  getActiveView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE);
    return leaves.length > 0 ? leaves[0].view : null;
  }
};
