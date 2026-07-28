# Claude Desktop Mirror

Chat with Claude from an Obsidian workspace and save conversations as Markdown.

## Features

- Chat with supported Claude models through the Anthropic API.
- Save and export conversations in the vault.
- Optional vault tools for reading, searching, creating, editing, and moving notes to trash.
- Optional co-work mode for multi-agent responses.
- Optional code mode for shell commands and file access outside the vault.
- Optional synchronization of a system prompt with a local file.

## Requirements and setup

This desktop-only plugin requires an Anthropic account, a separately billed Anthropic API key, and internet access.

Enter your API key under **Settings → Claude Desktop Mirror**. The key is stored locally using Obsidian's plugin data storage and is sent only to the Anthropic API for authentication.

## Security and privacy

The plugin connects directly to `api.anthropic.com`. Conversation content, enabled tool definitions, and tool results are sent to Anthropic to generate responses. Review [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy) before use.

Vault tools are disabled by default. When enabled, Claude can read, search, create, modify, and move notes to trash in the open vault.

Code mode is disabled by default. When explicitly enabled and selected, Claude can run shell commands and read or write files with the same operating-system permissions as Obsidian. Only enable it when you understand and accept that risk.

The plugin contains no telemetry, advertising, or third-party analytics.

## Trademark notice

Claude and Anthropic are trademarks of Anthropic PBC. This independent plugin is not affiliated with, endorsed by, or sponsored by Anthropic.

## License

MIT
