# apple-mcp

MCP server for macOS Apple apps. Provides 28 read/write tools across Notes, Reminders, Calendar, Contacts, and Safari -- all running locally on your Mac via SQLite and JXA (JavaScript for Automation).

## Install

### Claude Code

```bash
claude mcp add apple -- npx @roebot0/apple-mcp
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple": {
      "command": "npx",
      "args": ["@roebot0/apple-mcp"]
    }
  }
}
```

## Tools

### Notes (8 tools)

| Tool | Description |
|------|-------------|
| `apple_notes_list` | List notes with title, snippet, folder, and dates (paginated) |
| `apple_notes_search` | Search notes by keyword in title and snippet |
| `apple_notes_get` | Get full plaintext body of a note by exact title |
| `apple_notes_folders` | List all folders with note counts |
| `apple_notes_recent` | Get N most recently modified notes |
| `apple_notes_by_folder` | Get all notes in a specific folder |
| `apple_notes_create` | Create a new note in a specified folder |
| `apple_notes_stats` | Aggregate stats: total notes, per-folder counts, date range |

### Reminders (6 tools)

| Tool | Description |
|------|-------------|
| `apple_reminders_lists` | List all reminder lists with counts |
| `apple_reminders_list` | Get reminders in a specific list |
| `apple_reminders_due` | Get reminders due today, this week, or overdue |
| `apple_reminders_search` | Search reminders by keyword across all lists |
| `apple_reminders_create` | Create a new reminder with optional due date and priority |
| `apple_reminders_complete` | Mark a reminder as complete by name |

### Calendar (5 tools)

| Tool | Description |
|------|-------------|
| `apple_calendar_today` | Get today's events across all calendars |
| `apple_calendar_range` | Get events in a date range |
| `apple_calendar_calendars` | List all calendars |
| `apple_calendar_search` | Search events by title |
| `apple_calendar_upcoming` | Get next N upcoming events |

### Contacts (5 tools)

| Tool | Description |
|------|-------------|
| `apple_contacts_search` | Search contacts by name, email, or company |
| `apple_contacts_get` | Get full contact details by ID (emails, phones, etc.) |
| `apple_contacts_recent` | Get recently modified contacts |
| `apple_contacts_company` | List contacts at a specific company |
| `apple_contacts_stats` | Contact count and top companies |

### Safari (4 tools)

| Tool | Description |
|------|-------------|
| `apple_safari_history` | Get recent browsing history |
| `apple_safari_search_history` | Search history by URL or page title |
| `apple_safari_bookmarks` | List bookmarks, optionally filtered by folder |
| `apple_safari_reading_list` | Get all Reading List items |

## Requirements

- **macOS** (uses native SQLite databases and JXA automation)
- **Node.js >= 18**
- **Full Disk Access** required for Safari history -- grant it to your terminal app in System Settings > Privacy & Security > Full Disk Access
- Notes, Reminders, Calendar, and Contacts work without Full Disk Access

## How it works

- **Notes, Calendar, Contacts, Safari history**: Read directly from local SQLite databases (read-only)
- **Notes create, Reminders (all), Notes get**: Use JXA (`osascript -l JavaScript`) to interact with the native apps
- **Safari bookmarks/reading list**: Parse the Bookmarks.plist file

No network requests. No API keys. Everything stays on your Mac.

## Development

```bash
git clone https://github.com/AaronRoeF/apple-mcp.git
cd apple-mcp
npm install
npm run build
```

To test locally with Claude Code:

```bash
claude mcp add apple -- node /path/to/apple-mcp/start-mcp-server.js
```

## License

MIT
