# Clean View + Agent Dock

One plugin, two mods.

- **Clean View**: hides tool rows and shows a calm checklist above the prompt. `/simple on|off`, or the `● Clean View` button.
- **Agent Dock**: pick a Team Size (1 to 100); every request is split across exactly that many helper agents and shown as live cards. `/dock` opens or folds it, `/dock 10` sets the size, the `◆ Dock` button opens it.

Both draw only on the terminal and the Claude desktop app's Code tab.

## Install

`claude --plugin-dir /path/to/clean-view`, or set `CLAUDE_CODE_PLUGIN_DIRS` to the folder. Then `/reload-plugins` (or a new window).

## Waves of 20

Add to the `env` block of `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS": "20", "CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY": "20" } }
```

Without it the dock queues in waves of 10 (the lower engine default).
