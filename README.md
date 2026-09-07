# Bot Crossing Desktop

Your local Codex sessions become a city: each conversation has a building and an astronaut, with chat and controls floating over the scene. This Windows desktop fork builds on [Bot Crossing by Jarren Rocks](https://github.com/jarrenrocks/bot-crossing).

## Download and open

1. Open this repository's **Releases** page and download **Bot-Crossing-Windows-v1.0.0.zip**.
2. Extract the entire ZIP to a folder you can write to, such as Documents or a folder on your desktop.
3. Open **Bot Crossing App/Bot Crossing.exe**. Keep the other files beside the executable.
4. Have the Codex desktop app installed and signed in, with local sessions on this computer.

The download is a portable **Windows x64** app. It includes its own runtime; Node.js is only needed for building from source. This community build is unsigned. Watching the city makes no model requests. Sending a chat message uses your existing Codex account and its usage limits.

## What this version adds

- Built-in Codex chat with streaming replies, saved per-session drafts, permission prompts, questions, and a stop control.
- Resizable reply and message panels in the game's theme. **Hide panels** gives you a clear city view; **Graphics** opens the full settings.
- A separate building for each session. **Section color** changes its building, astronaut face, card portrait, and mini helpers together.
- Suit colors that show last activity: mint under an hour, blue for 1–24 hours, lavender for 1–7 days, and gray for older sessions.
- A default 14-day history window, adjustable through **All time**. **Keep visible** preserves ongoing sections across date filters.
- Session renaming, Codex archive/restore controls, and new conversations started from project controls.
- Tall project headquarters with physical letter signs, editable names, and project badges.
- Twelve backpack designs, expressive faces, and nearby waves or dances when an agent is selected.
- Small working helpers that travel at twice the normal speed and share their parent's building.
- Recent public progress updates above actively working agents, with the hammer between updates.
- Existing sessions placed at their own buildings and improved routes around crowded city blocks.

## Everyday controls

Select an astronaut or a session row, then **Open** to read or continue that conversation. Use **Rename session**, **Section color**, or **Keep visible** on the agent card. Choose a project and **New conversation** to start another task there.

**Open chat** restores the conversation panels. **City controls** brings back the history, projects, and session list. **Size** changes reply width/height and message-box width/height; sizes are saved.

Drag to move, scroll to zoom, and right-drag to rotate. Press **0** to reset the view, **S** for settings, and **H** to hide the interface. The settings include quality presets, render scale, shadows, blur, particles, and the crew limit.

An empty city means no matching local Codex sessions were found. Cloud-only tasks are not included. While a task runs in another Codex window, its replies can be read here; send your follow-up when that turn finishes. Very short helper tasks can start and finish between the four-second scans. The watcher displays recorded progress, not invented completion estimates.

## Local data and chat

The portable app creates a **data** folder beside the executable. It holds the local colony layout and the desktop profile, including saved chat drafts and UI settings. Keep it when updating your own app; exclude it from any copy you share. The release contains no sessions, credentials, personal paths, or saved browser profile.

The watcher reads local Codex metadata and transcripts. Opening history does not start a model turn. Sending messages, answering approvals, renaming, archiving, and restoring are explicit actions through the installed Codex app-server. Chat requests use a workspace-write sandbox with user approval requests. The HTTP listener stays on loopback and rejects unrelated browser origins. Closing the app closes its chat connections and local watcher.

The Windows app enables Codex. A legacy Claude Code scanning adapter remains in the source for browser/host use; standalone Claude chat is not included. Optional host integration hooks are included, but the separate private Dev Studio application is not part of this release. A host may set BOT_CROSSING_PROJECT_ROOT to restrict its colony to one project; the standalone app shows all projects by default.

## Build from source

Use **Node.js 24 or newer**, npm, and Windows for the desktop package.

```powershell
npm ci
npm test
npm run build
npm run desktop
```

For browser development, run **npm run dev** and use the local address printed by Vite. The Windows helper **launch.ps1** starts an already-built browser version.

To make a portable Windows folder:

```powershell
npm run package:windows
```

The packager creates **Bot Crossing App** next to the source folder. Use an empty destination; it refuses to overwrite an existing app or its data. To choose another output after building:

```powershell
node desktop/package-windows.mjs "C:\Builds\Bot Crossing App"
```

The packed assets are included in public/assets. Repacking is only necessary when changing the original art; see the asset credits and the scripts in tools. Source-based macOS/Linux behavior is not validated by this Windows release.

## Credits and license

Original Bot Crossing: **Jarren Rocks**, copyright 2026, [MIT](LICENSE). This fork adds Windows packaging, Codex integration, and the customization features described above.

KayKit art by **Kay Lousberg** is CC0. Preserve [asset credits](public/assets/CREDITS.md), the sign-font notice, and [third-party notices](THIRD-PARTY-NOTICES.md) when redistributing.

Not affiliated with OpenAI, Anthropic, or the original author's other products.
