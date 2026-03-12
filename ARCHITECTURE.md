# OpenClaw Architecture

## Overview

OpenClaw is a **personal AI assistant gateway** that bridges 20+ messaging platforms (WhatsApp,
Telegram, Slack, Discord, Signal, iMessage, BlueBubbles, IRC, Microsoft Teams, Matrix, Feishu,
LINE, Mattermost, Nextcloud Talk, Nostr, Synology Chat, Tlon, Twitch, Zalo, Zalo Personal,
WebChat) to configurable AI agents powered by OpenAI, Anthropic, Google, GitHub Copilot, Qwen,
and other model providers.

**Core Technology Stack:**

- Runtime: Node.js >=22 (also runs via Bun)
- Language: TypeScript (ESM, strict mode)
- Package Managers: npm, pnpm (primary), bun
- Build Tool: tsdown (Rollup-based bundler)
- Test Framework: Vitest

---

## Repository Layout

```
.
+-- src/                   # Core TypeScript source code
+-- extensions/            # First-party channel/feature extensions (npm workspace packages)
+-- ui/                    # Web UI (Vite + Lit web components)
+-- apps/
|   +-- macos/             # macOS menubar app (Swift/SwiftUI)
|   +-- ios/               # iOS app (Swift/SwiftUI)
|   +-- android/           # Android app (Kotlin)
+-- docs/                  # Mintlify documentation source
+-- scripts/               # Build, release, and lint scripts
+-- skills/                # Bundled agent skills
+-- packages/              # Shared npm packages
```

---

## High-Level Architecture

```
+--------------------------------------------------------------------+
|                        CLI / ENTRY POINT                           |
|  openclaw.mjs -> src/entry.ts -> src/index.ts -> src/cli/program.ts|
+------------------+-------------------------------------------------+
                   |
          +--------+----------------------------------------+
          v                                                 v
+-----------------+                             +---------------------+
|    GATEWAY      |                             |     COMMANDS        |
| (src/gateway/)  |                             | (src/commands/)     |
| Central message |                             | CLI: agents, auth,  |
| hub / WebSocket |                             | config, status...   |
| server          |                             +---------------------+
+-------+---------+
        |
        v
+-------------------+
|  MESSAGE ROUTING  |
|  (src/routing/)   |
|  resolve-route    |
|  session-key      |
|  bindings         |
+-------+-----------+
        |
   +----+------------------------+
   v                             v
+-----------+          +------------------+
|  AGENTS   |          |   CHANNELS       |
|(src/      |          | (src/telegram/   |
| agents/)  |          |  src/discord/    |
| LLM exec  |          |  src/slack/      |
|           |          |  extensions/*/)  |
+-----------+          +------------------+
```

---

## Module Reference

### 1. Entry Points (`src/entry.ts`, `src/index.ts`, `openclaw.mjs`)

**Purpose:** CLI bootstrap, argument normalization, and program initialization.

| File | Role |
|------|------|
| `openclaw.mjs` | Top-level Node.js shim; sets `--experimental-vm-modules` flags and invokes `dist/entry.js` |
| `src/entry.ts` | Respawn policy, compile-cache enablement, experimental-warning suppression, fast-path for `--version`/`--help` |
| `src/index.ts` | Exports `buildProgram()` which wires all sub-commands via Commander.js |
| `src/runtime.ts` | `RuntimeEnv` type + `defaultRuntime` / `createNonExitingRuntime()` -- abstracts `console.log/error` and `process.exit` |
| `src/globals.ts` | Module-level flags: `isVerbose()`, `setVerbose()`, `isYes()`, `setYes()`, `logVerbose()`, palette helpers |
| `src/logger.ts` | Structured logging: `logInfo()`, `logWarn()`, `logSuccess()`, `logError()`, `logDebug()` |
| `src/logging.ts` | Lower-level log routing (file sinks, log levels) |
| `src/version.ts` | `getVersion()` -- reads version from `package.json` |
| `src/utils.ts` | Generic helpers: `sleep()`, `retry()`, `deferred()`, `asyncPool()`, truncation, etc. |

---

### 2. CLI Layer (`src/cli/`)

**Purpose:** Command-line interface wiring.

| File | Role |
|------|------|
| `program.ts` | Builds the Commander.js `Command` tree; registers all top-level commands |
| `argv.ts` | Raw `process.argv` parsing helpers |
| `profile.ts` | `parseCliProfileArgs()` -- debug profile flag detection |
| `respawn-policy.ts` | Decides whether `entry.ts` should respawn the process with different Node flags |
| `prompt.ts` | `confirm()` -- yes/no prompt wrapper |
| `deps.ts` | `createDefaultDeps()` -- builds the dependency-injection object passed to commands |
| `windows-argv.ts` | `normalizeWindowsArgv()` -- fixes Windows CMD quoting |
| `daemon-cli.ts` | Separate CLI entry for the `openclaw daemon` sub-program (systemd/launchd management) |
| `progress.ts` | Progress bar / spinner helpers using `osc-progress` and `@clack/prompts` |

---

### 3. Gateway (`src/gateway/`)

**Purpose:** The central always-on server. Accepts WebSocket connections from companion apps and the
CLI, manages channel lifecycles, dispatches inbound messages to agents, and streams responses back.

| File | Role |
|------|------|
| `boot.ts` | `startGateway()` -- initializes channels, binds port, registers signal handlers |
| `server.ts` | Hono HTTP/WebSocket server setup; request authentication middleware |
| `auth.ts` | Gateway token issuance and validation (`--token`, cookie auth, pairing auth) |
| `client.ts` | `GatewayClient` -- connects to a running gateway over WebSocket |
| `chat-abort.ts` | Chat cancellation/abort logic |
| `chat-sanitize.ts` | Input sanitization before LLM dispatch |
| `chat-threading.ts` | Reply threading within conversations |
| `channel-health-monitor.ts` | Polls each channel adapter; reports degraded/offline state |
| `channel-health-policy.ts` | Configurable reconnect / exponential-backoff policies |
| `channel-status-patches.ts` | Applies incremental status deltas to the shared channel-status map |
| `agent-event-assistant-text.ts` | Converts streaming LLM token events into channel-deliverable chunks |
| `call.ts` | Voice/call session management |
| `reconnect-gating.ts` | Rate-limits repeated reconnect attempts |
| `protocol/` | Gateway WebSocket protocol schema (TypeBox-validated JSON) |

**Key Responsibilities:**
- Listen on configured ports (default 18789)
- Route inbound messages to appropriate agents
- Distribute agent responses back to source channels
- Manage authentication state across channels
- Monitor channel health and connectivity

---

### 4. Agents (`src/agents/`)

**Purpose:** Execute AI models, manage tool calling, and stream results.

#### 4a. Agent Workspace

| File | Role |
|------|------|
| `agent-scope.ts` | `resolveAgentDir()`, `resolveAgentWorkspaceDir()` -- map agent ID to filesystem path |
| `agent-paths.ts` | Path helpers for agent-level directories |
| `workspace.ts` | `ensureAgentWorkspace()` -- creates and validates workspace directory structure |
| `defaults.ts` | `DEFAULT_MODEL`, `DEFAULT_PROVIDER` constants |
| `identity.ts` | `resolveAgentIdentity()` -- reads `identity.yaml` for agent name/avatar |
| `timeout.ts` | `resolveAgentTimeoutMs()` -- per-agent timeout configuration |
| `model-selection.ts` | Model / provider picker logic (respects config overrides) |

#### 4b. Provider Auth

| File | Role |
|------|------|
| `auth-profiles.ts` | `loadAuthProfiles()`, `selectAuthProfile()` -- manages multiple API-key/OAuth profiles |
| `api-key-rotation.ts` | Rotates API keys on 429 / auth-failure; enforces cooldown windows |
| `auth-health.ts` | `isAuthHealthy()` -- validates current credential before each request |
| `apply-patch.ts` | Applies hot credential patches without restarting |

#### 4c. Advanced Agent Features

| File | Role |
|------|------|
| `acp-spawn.ts` | Spawns an ACP (Agent Communication Protocol) child agent |
| `anthropic-payload-log.ts` | Debug-logs raw Anthropic request/response payloads |
| `announce-idempotency.ts` | Prevents duplicate agent announcements on reconnect |
| `tool-result-*.ts` | Post-processes tool/function call results before inserting into conversation |
| `pi-embedded.ts` | `runEmbeddedPiAgent()` -- runs the Pi agent library inline |

---

### 5. Auto-Reply (`src/auto-reply/`)

**Purpose:** The inbound message pipeline -- from raw channel event to LLM request and response.

| File | Role |
|------|------|
| `dispatch.ts` | Top-level `dispatch()` -- entry point for every inbound message |
| `reply.ts` | Orchestrates the full reply cycle: resolve route -> build prompt -> call LLM -> stream response |
| `model.ts` | Constructs the LLM request payload (messages, system prompt, tools) |
| `model-runtime.ts` | Selects the correct model API client for the resolved provider |
| `chunk.ts` | Splits long LLM responses into per-platform character-limit chunks |
| `send-policy.ts` | Decides whether / how to send a response (rate limits, DM-only, etc.) |
| `inbound-debounce.ts` | Debounces rapid-fire messages from the same user |
| `command-detection.ts` | Parses `/commands` from message text |
| `commands-registry.ts` | Registry of built-in `/commands` with handler resolution |
| `skill-commands.ts` | Loads and registers hook/skill-defined commands |
| `heartbeat.ts` | Periodic keepalive replies (e.g. for always-online channels) |
| `heartbeat-reply-payload.ts` | Heartbeat message payload builder |
| `group-activation.ts` | Group chat activation rules (mention required, etc.) |
| `templating.ts` | System-prompt variable substitution |
| `thinking.ts` | Handles extended-thinking / reasoning tokens |
| `tokens.ts` | Token budget management per request |
| `envelope.ts` | Wraps the processed message for delivery |
| `fallback-state.ts` | Manages fallback state when primary agent is unavailable |
| `types.ts` | Shared type definitions for the auto-reply pipeline |

---

### 6. Routing (`src/routing/`)

**Purpose:** Determines which agent/account should handle each inbound message.

| File | Role |
|------|------|
| `resolve-route.ts` | `resolveRoute()` -- core routing resolution (largest file, ~24 KB) |
| `account-id.ts` | `AccountId` type and parsing |
| `account-lookup.ts` | `lookupAccount()` -- finds the local account that matches an inbound sender |
| `bindings.ts` | `resolveBinding()` -- maps (channel, remote-id) -> local account |
| `session-key.ts` | `buildSessionKey()` -- stable key for conversation continuity |
| `session-key.continuity.ts` | `isContinuationOf()` -- determines if a message extends an existing session |
| `default-account-warnings.ts` | Emits warning when messages route to the fallback default account |

---

### 7. Channels (`src/channels/`)

**Purpose:** Channel-agnostic features and configuration shared across all adapters.

| File | Role |
|------|------|
| `channel-config.ts` | `ChannelConfig` schema (TypeBox) and accessors |
| `account-summary.ts` | `buildAccountSummary()` -- human-readable channel account description |
| `account-snapshot-fields.ts` | Extracts normalized fields from raw channel account data |
| `chat-type.ts` | `ChatType` enum: `dm`, `group`, `channel`, `broadcast` |
| `conversation-label.ts` | Add/read custom labels on conversations |
| `dock.ts` | Pin/dock conversations in companion apps |
| `location.ts` | Geographic location message handling |
| `mention-gating.ts` | `isMentionRequired()`, `isMentioned()` -- group mention policy enforcement |
| `model-overrides.ts` | Channel-level model/provider override resolution |
| `command-gating.ts` | Gate `/commands` by channel type or permission level |
| `plugins/` | Runtime-loaded channel plugin host: agent-tools, action handlers |

---

### 8. Messaging Platform Adapters

#### 8a. Telegram (`src/telegram/`)

| File | Role |
|------|------|
| `accounts.ts` | Account listing, connection status |
| `account-inspect.ts` | Retrieve account metadata (bot username, chat info) |
| `bot-handlers.ts` | `registerHandlers()` -- grammY update handler registration |
| `bot-message-context.ts` | Extracts structured data from a grammY `Context` |
| `send.ts` | `sendMessage()`, `sendPhoto()`, `sendDocument()` |
| `format.ts` | Converts Markdown to Telegram MarkdownV2 |
| `api-logging.ts` | Verbose API call log wrapper |
| `audit.ts` | Channel audit-log helpers |
| `token.ts` | Bot-token storage and rotation |
| `draft-chunking.ts` | Splits long drafts into Telegram message chunks |

#### 8b. Discord (`src/discord/`)

| File | Role |
|------|------|
| `client.ts` | discord.js `Client` wrapper with reconnect logic |
| `accounts.ts` | Account/guild enumeration |
| `account-inspect.ts` | Guild/channel metadata retrieval |
| `guilds.ts` | Guild list management |
| `mentions.ts` | `parseMentions()` -- extract user/role mentions from message content |
| `monitor.ts` | Event listener registration (messageCreate, interactionCreate, etc.) |
| `api.ts` | Low-level Discord REST API helpers |
| `components.ts` | Build interactive components (buttons, select menus) |

#### 8c. Slack (`src/slack/`)

| File | Role |
|------|------|
| `client.ts` | `@slack/bolt` `App` wrapper |
| `accounts.ts` | Workspace listing |
| `account-inspect.ts` | Channel / workspace metadata |
| `blocks.ts` | Block Kit message builders |
| `actions.ts` | Interactive action handler registration |
| `monitor.ts` | Event listener registration |
| `directory-live.ts` | Live user-directory updates |

#### 8d. Signal (`src/signal/`)

| File | Role |
|------|------|
| `client.ts` | Signal protocol client initialization |
| `daemon.ts` | signal-cli daemon lifecycle management |
| `monitor.ts` | Inbound message polling / event subscription |
| `send.ts` | `sendSignalMessage()` |
| `send-reactions.ts` | Emoji reaction sending |
| `format.ts` | Message text formatter |
| `identity.ts` | Signal identity verification |
| `probe.ts` | `probeSignalAvailability()` -- health check |

#### 8e. WhatsApp (`src/whatsapp/`)

| File | Role |
|------|------|
| `normalize.ts` | `normalizeJid()` -- canonicalizes WhatsApp JID formats |
| `resolve-outbound-target.ts` | Resolves the correct JID for an outbound send |

---

### 9. Providers (`src/providers/`)

**Purpose:** Authentication helpers for LLM providers that use non-standard OAuth flows.

| File | Role |
|------|------|
| `github-copilot-auth.ts` | GitHub Copilot device-flow OAuth |
| `github-copilot-token.ts` | Access-token refresh and caching |
| `github-copilot-models.ts` | Enumerates available Copilot models |
| `qwen-portal-oauth.ts` | Alibaba Qwen portal OAuth flow |
| `google-shared.ts` | Shared Google/Gemini auth helpers |
| `kilocode-shared.ts` | KiloCode provider utilities |

---

### 10. Plugin SDK (`src/plugin-sdk/`)

**Purpose:** Stable public API surface for plugin/extension authors.

| File | Role |
|------|------|
| `index.ts` | Main re-export barrel (all public API) |
| `core.ts` | `PluginContext`, core lifecycle hooks |
| `compat.ts` | Backwards-compatibility shims |
| `account-id.ts` | `AccountId` type export |
| `account-resolution.ts` | `resolveAccountFromMessage()` |
| `channel-lifecycle.ts` | `onChannelConnect()`, `onChannelDisconnect()` hooks |
| `channel-config-helpers.ts` | Helpers for reading/writing channel config |
| `fetch-auth.ts` | Fetch-with-auth utilities for making authenticated requests |
| `group-access.ts` | Group membership and access control helpers |
| `acpx.ts` | Extended ACP protocol bindings |
| `thread-ownership.ts` | Thread ownership API |
| `telegram.ts`, `discord.ts`, `slack.ts`, `signal.ts`, `imessage.ts`, ... | Per-channel type exports |
| `keyed-async-queue.ts` | `KeyedAsyncQueue` -- serialized per-key async queue utility |

---

### 11. Commands (`src/commands/`)

**Purpose:** Business logic for every `openclaw <subcommand>`.

| File | Role |
|------|------|
| `agents.ts` | `agents list`, `agents add`, `agents bind`, `agents delete` |
| `agents.commands.*.ts` | Individual agent sub-command implementations |
| `agents.bindings.ts` | Binding management sub-commands |
| `agents.providers.ts` | Provider configuration sub-commands |
| `auth-choice.ts` | Interactive auth provider selection UI |
| `auth-choice.apply-*.ts` | Apply provider-specific auth (OpenAI, Anthropic, GitHub Copilot, Qwen, Google, etc.) |

---

### 12. Hooks System (`src/hooks/`)

**Purpose:** User-extensible scripts that run before/after agent interactions or on schedules.

| File | Role |
|------|------|
| `hooks.ts` | `registerHook()`, `runHook()` -- hook registry and executor |
| `config.ts` | Hook configuration schema and loading |
| `hooks-install.ts` | Install hooks from URL or local path |
| `hooks-status.ts` | `getHookStatus()` -- reports installed hooks and their health |
| `bundled-dir.ts` | Resolves the directory of built-in bundled hooks |
| `frontmatter.ts` | Parses YAML frontmatter from hook scripts |
| `import-url.ts` | Dynamic import from HTTPS URLs |
| `install.ts` | Installation utilities (copy, symlink, validate) |
| `gmail.ts` | Gmail integration hook |
| `gmail-watcher.ts` | Gmail push-notification watcher |
| `bundled/` | Pre-built hooks shipped with OpenClaw (e.g. web-search, calendar) |
| `llm-slug-generator.ts` | Generates URL-safe slugs using an LLM for naming conversations |

---

### 13. Memory System (`src/memory/`)

**Purpose:** Embedding-based semantic memory for agents.

| File | Role |
|------|------|
| `backend-config.ts` | `MemoryBackendConfig` -- selects storage backend (SQLite, LanceDB) |
| `embedding-models.ts` | Available embedding models and dimension mapping |
| `embedding-limits.ts` | Token limits per embedding model |
| `embeddings-debug.ts` | Debug output for embedding computations |
| `embeddings-utils.ts` | Vector math utilities (cosine similarity, normalization) |
| `batch-openai.ts` | Batch embedding via OpenAI API |
| `batch-gemini.ts` | Batch embedding via Gemini API |
| `batch-voyage.ts` | Batch embedding via Voyage AI API |

---

### 14. Pairing System (`src/pairing/`)

**Purpose:** Secure device pairing for iMessage, BlueBubbles, and Signal desktop.

| File | Role |
|------|------|
| `pairing-store.ts` | `PairingStore` -- persists pairing state to disk (~26 KB, largest file) |
| `setup-code.ts` | `generateSetupCode()`, `validateSetupCode()` -- 6-digit pairing codes |
| `pairing-challenge.ts` | Challenge-response protocol for pairing verification |
| `pairing-messages.ts` | Human-readable pairing message templates |
| `pairing-labels.ts` | State machine labels (pending, paired, revoked) |

---

### 15. Configuration (`src/config/`)

**Purpose:** Load, validate, and access all configuration (agent definitions, channel settings, etc.).

| File | Role |
|------|------|
| `config.ts` | `loadConfig()`, `saveConfig()` -- main config file operations |
| `config-paths.ts` | `getConfigDir()`, `getConfigFilePath()` -- OS-appropriate config locations |
| `agent-dirs.ts` | `resolveAgentDir()` -- per-agent directory resolution |
| `agent-limits.ts` | Concurrency and resource limits per agent |
| `backup-rotation.ts` | Rolling backup of config files |
| `bindings.ts` | Binding config (channel <-> account mapping) |
| `channel-capabilities.ts` | Feature-detection per channel (supports voice, reactions, etc.) |
| `commands.ts` | Command configuration (enabled/disabled per channel) |
| `sessions.ts` | `loadSessionStore()`, `saveSessionStore()` -- session persistence |
| `discord.ts`, `hooks.ts`, `identity.ts`, `env-vars.ts` | Feature-specific config sub-schemas |

---

### 16. Shared Utilities (`src/shared/`)

**Purpose:** Cross-cutting types and pure utility functions.

| File | Role |
|------|------|
| `chat-message.ts` | `ChatMessage`, `MessageRole`, `ContentBlock` types |
| `chat-history.ts` | Conversation history manipulation helpers |
| `session-id.ts` | `generateSessionId()` |
| `session-types.ts` | `SessionState`, `SessionMeta` types |
| `assistant-identity-values.ts` | Canonical assistant identity enum values |
| `avatar-policy.ts` | `resolveAvatar()` -- picks correct avatar image |
| `device-auth.ts` | Device-level authentication type definitions |
| `requirements.ts` | `assertRuntime()` -- checks Node and platform requirements |
| `config-eval.ts` | Evaluates config expressions (env var interpolation) |
| `operator-scope-compat.ts` | Legacy operator scope compatibility helpers |

---

### 17. Infrastructure (`src/infra/`)

**Purpose:** Low-level platform utilities.

#### 17a. Binary Management

| File | Role |
|------|------|
| `binaries.ts` | Download, verify, and cache external binaries (signal-cli, ffmpeg, etc.) |
| `archive.ts` | `.tar.gz` / `.zip` extraction |
| `brew.ts` | Homebrew package install/check |

#### 17b. Network

| File | Role |
|------|------|
| `ports.ts` | `findAvailablePort()`, `isPortAvailable()` |
| `bonjour-discovery.ts` | mDNS service discovery via `@homebridge/ciao` |
| `bonjour-register.ts` | mDNS service registration |

#### 17c. Process Execution

| File | Role |
|------|------|
| `exec.ts` | `exec()`, `spawn()` wrappers with timeout and abort support |
| `abort-signal.ts` | `AbortSignal` composition utilities |
| `backoff.ts` | Exponential backoff with jitter |
| `agent-events.ts` | Agent event emitter setup |

#### 17d. Environment

| File | Role |
|------|------|
| `env.js` | Environment variable normalization (loaded before TypeScript) |
| `dotenv.js` | `.env` file loading |
| `path-env.ts` | PATH manipulation utilities |
| `windows-argv.ts` | Windows argument vector normalization |

#### 17e. System Guards

| File | Role |
|------|------|
| `runtime-guard.ts` | `assertNodeVersion()` -- validates Node.js >=22 |
| `is-main.ts` | `isMainModule()` -- detects if current file is the entry point |
| `warning-filter.ts` | Suppresses known benign Node.js `process.warning` events |
| `unhandled-rejections.ts` | Global unhandled-rejection handler |

---

### 18. Media Processing (`src/media/`)

**Purpose:** Audio, video, and image handling.

| File | Role |
|------|------|
| `audio.ts` | Audio recording, playback, format conversion |
| `audio-tags.ts` | Audio metadata (ID3 tags, duration, bitrate) |
| `image-ops.ts` | Image resize, crop, format conversion (via `sharp`) |
| `ffmpeg-exec.ts` | `execFfmpeg()` -- typed wrapper around FFmpeg CLI |
| `ffmpeg-limits.ts` | Max resolution, bitrate, and duration constraints |
| `pdf-extract.ts` | PDF text extraction via `pdfjs-dist` |
| `base64.ts` | Media <-> Base64 conversion |
| `fetch.ts` | Authenticated media URL fetching |
| `input-files.ts` | Handles attached files in inbound messages |
| `mime.ts` | `detectMime()` -- content-type detection via `file-type` |

---

### 19. Additional Modules

| Module | Purpose |
|--------|---------|
| `src/sessions/` | `SessionStore` -- in-memory + persisted session lifecycle (TTL expiry, continuity detection) |
| `src/secrets/` | `SecretStore` -- encrypted credential storage + `auditCredentials()` read-only review |
| `src/security/` | `sanitizeMessageContent()`, per-user rate limiting, allow-list enforcement, operator scope |
| `src/daemon/` | System service management: launchd (macOS), systemd (Linux), Task Scheduler (Windows) |
| `src/wizard/` | Interactive setup wizard `openclaw onboard` -- `runOnboarding()`, gateway config, completion |
| `src/media-understanding/` | Vision (`describeImage()`), transcription (`transcribeAudio()`), document extraction |
| `src/link-understanding/` | URL content extraction via `@mozilla/readability` + Playwright fallback |
| `src/context-engine/` | LLM context window assembly: pruning, token budgeting, memory injection |
| `src/acp/` | Agent Communication Protocol client and child-agent spawning |
| `src/cron/` | `schedule()` / `unschedule()` cron job management via `croner` |
| `src/process/` | Child process lifecycle: `execWithTimeout()`, long-running spawn management |
| `src/tui/` | `startTui()` -- Pi-library based terminal UI (`openclaw tui`) |
| `src/tts/` | Provider-agnostic TTS: `synthesizeSpeech()` -- Edge TTS, OpenAI TTS |
| `src/polls.ts` | `createPoll()`, `closePoll()`, `getPollResults()` -- Discord/Telegram polls |
| `src/plugins/` | Plugin loader: scans directories, validates, calls `plugin.register()` |
| `src/i18n/` | `t()` translation function with JSON locale files |
| `src/markdown/` | `renderMarkdown()`, `stripMarkdown()` -- markdown-it based processing |
| `src/compat/` | `migrateConfig()` -- versioned config migrations |
| `src/logging/` | Log sinks with rotation, JSON formatting, level hierarchy |
| `src/types/` | Global TypeScript type augmentations (`NodeJS.ProcessEnv`, etc.) |
| `src/canvas-host/` | A2UI canvas renderer host for rich interactive UI in companion apps |
| `src/browser/` | Playwright browser pool for sandboxed web automation tasks |
| `src/node-host/` | Android Node.js runtime lifecycle management |

---

## Extensions (`extensions/`)

Extensions are separate npm workspace packages that add optional channel support or features.
Each extension exports a `register(ctx: PluginContext)` function called at gateway startup.

### Channel Extensions

| Extension | Channel | Key Files |
|-----------|---------|-----------|
| `extensions/telegram/` | Telegram (extension variant) | `src/channel.ts`, `src/send.ts` |
| `extensions/discord/` | Discord (extension variant) | `src/channel.ts`, `src/send.ts` |
| `extensions/slack/` | Slack (extension variant) | `src/channel.ts`, `src/send.ts` |
| `extensions/signal/` | Signal (extension variant) | `src/channel.ts`, `src/daemon.ts` |
| `extensions/whatsapp/` | WhatsApp via Baileys | `src/channel.ts`, `src/session.ts`, `src/send.ts` |
| `extensions/imessage/` | iMessage via BlueBubbles / native | `src/channel.ts`, `src/pairing.ts` |
| `extensions/bluebubbles/` | BlueBubbles | `src/channel.ts`, `src/api.ts` |
| `extensions/msteams/` | Microsoft Teams via Bot Framework | `src/channel.ts`, `src/bot.ts` |
| `extensions/matrix/` | Matrix protocol | `src/channel.ts`, `src/client.ts` |
| `extensions/googlechat/` | Google Chat | `src/channel.ts`, `src/webhook.ts` |
| `extensions/feishu/` | Feishu / Lark | `src/channel.ts`, `src/bot.ts` |
| `extensions/line/` | LINE Messaging API | `src/channel.ts`, `src/send.ts` |
| `extensions/irc/` | IRC | `src/channel.ts`, `src/client.ts` |
| `extensions/mattermost/` | Mattermost | `src/channel.ts`, `src/client.ts` |
| `extensions/nextcloud-talk/` | Nextcloud Talk | `src/channel.ts`, `src/api.ts` |
| `extensions/nostr/` | Nostr protocol | `src/channel.ts`, `src/relay.ts` |
| `extensions/synology-chat/` | Synology Chat | `src/channel.ts`, `src/webhook.ts` |
| `extensions/tlon/` | Tlon / Urbit | `src/channel.ts`, `src/api.ts` |
| `extensions/twitch/` | Twitch Chat | `src/channel.ts`, `src/client.ts` |
| `extensions/zalo/` | Zalo (official API) | `src/channel.ts`, `src/send.ts` |
| `extensions/zalouser/` | Zalo (personal account) | `src/channel.ts`, `src/session.ts` |

### Feature Extensions

| Extension | Purpose | Key Files |
|-----------|---------|-----------|
| `extensions/voice-call/` | Real-time voice calls (WebRTC / Discord voice) | `src/manager.ts`, `src/media-stream.ts` |
| `extensions/talk-voice/` | Voice wake word + TTS for companion apps | `src/wake.ts`, `src/speak.ts` |
| `extensions/memory-core/` | In-process SQLite vector memory | `src/store.ts`, `src/search.ts` |
| `extensions/memory-lancedb/` | LanceDB vector memory (external process) | `src/store.ts`, `src/client.ts` |
| `extensions/llm-task/` | Async LLM sub-task spawning | `src/task.ts`, `src/scheduler.ts` |
| `extensions/thread-ownership/` | Per-thread agent ownership | `src/owner.ts`, `src/policy.ts` |
| `extensions/diffs/` | Code diff rendering in messages | `src/diff.ts`, `src/format.ts` |
| `extensions/open-prose/` | Rich text / prose rendering | `src/render.ts` |
| `extensions/phone-control/` | Phone dialing automation | `src/dial.ts` |
| `extensions/device-pair/` | Device pairing UI (QR codes) | `src/pair.ts`, `src/qr.ts` |
| `extensions/lobster/` | Lobster-specific customizations | `src/index.ts` |
| `extensions/acpx/` | Extended ACP protocol support | `src/index.ts` |
| `extensions/copilot-proxy/` | GitHub Copilot proxy integration | `src/proxy.ts` |
| `extensions/diagnostics-otel/` | OpenTelemetry diagnostics export | `src/tracer.ts`, `src/exporter.ts` |
| `extensions/google-gemini-cli-auth/` | Google Gemini CLI OAuth | `src/auth.ts` |
| `extensions/minimax-portal-auth/` | MiniMax portal OAuth | `src/auth.ts` |
| `extensions/qwen-portal-auth/` | Qwen portal OAuth | `src/auth.ts` |
| `extensions/shared/` | Shared utilities across extensions | `src/index.ts` |
| `extensions/test-utils/` | Test helpers for extension authors | `src/index.ts` |

---

## Web UI (`ui/`)

A browser-based control panel built with Vite + Lit (Web Components).

| File/Dir | Role |
|----------|------|
| `src/main.ts` | Entry point -- bootstraps Lit app |
| `src/app.ts` | Root `<openclaw-app>` component |
| `src/views/` | Page-level view components (dashboard, channels, agents, settings) |
| `src/components/` | Reusable UI components |
| `src/api/` | Gateway REST/WebSocket client |
| `src/state/` | Lit Signal-based reactive state |
| `vite.config.ts` | Vite build configuration |

---

## Core Message Flow

### Inbound Message (Channel -> Agent -> Response)

```
1. Channel adapter receives raw event
   (e.g. grammY update, discord messageCreate, Baileys message)
         |
2. Normalize to internal ChatMessage format
   (src/shared/chat-message.ts)
         |
3. Gateway receives normalized message
   (src/gateway/boot.ts)
         |
4. Resolve route (src/routing/resolve-route.ts)
   +-- Look up binding: channel + sender -> local account
   +-- Build session key for conversation continuity
   +-- Select agent configuration
         |
5. Auto-reply dispatch (src/auto-reply/dispatch.ts)
   +-- Debounce rapid messages
   +-- Detect /commands
   +-- Route to reply pipeline
         |
6. Build LLM request (src/auto-reply/model.ts)
   +-- Assemble context window (system + history + memory)
   +-- Attach available tools
   +-- Apply model overrides
         |
7. Execute agent (src/agents/)
   +-- Select model + provider + auth profile
   +-- Stream tokens from LLM API
   +-- Process tool calls iteratively
         |
8. Chunk and send response (src/auto-reply/chunk.ts)
   +-- Channel adapter sends to platform
```

---

## Authentication Architecture

```
+------------------------------------------------+
|          PROVIDER AUTH STORE                   |
|  (src/secrets/secret-store.ts)                |
|                                                |
|  OpenAI API key        ----+                   |
|  Anthropic API key     ----|                   |
|  GitHub Copilot OAuth  ----|                   |
|  Qwen Portal OAuth     ----|                   |
|  Google/Gemini OAuth   ----+                   |
+------------------+-----------------------------+
                   | rotation + health checks
                   v
+--------------------------------------------------+
|          AUTH PROFILE SELECTOR                   |
|  (src/agents/auth-profiles.ts)                  |
|                                                  |
|  [ Profile 1  ] [ Profile 2  ] [ Profile N  ]   |
|  [ (primary)  ] [ (fallback) ] [ (fallback) ]   |
|                                                  |
|  cooldown -> rotate on 429/auth-fail             |
+--------------------------------------------------+
```

---

## Configuration Directory Layout

```
~/.openclaw/
+-- config.yaml              # Main gateway + agent config
+-- agents/
|   +-- <agent-name>/
|       +-- config.yaml      # Per-agent overrides (model, tools, hooks)
|       +-- identity.yaml    # Agent name, avatar, description
|       +-- workspace/       # Agent working directory
+-- sessions/
|   +-- <session-key>.json   # Serialized conversation history
+-- hooks/
|   +-- <hook-name>.ts       # Custom hook scripts
+-- pairing/
|   +-- <device-id>.json     # Pairing state per device
+-- credentials/             # Channel-specific auth tokens
```

---

## Extension Development Guide

### Creating a Channel Extension

```typescript
// extensions/my-channel/index.ts
import type { PluginContext } from "openclaw/plugin-sdk";

export async function register(ctx: PluginContext) {
  ctx.registerChannel({
    id: "my-channel",
    displayName: "My Channel",
    async connect(config) {
      // Initialize your channel client
    },
    async send(message) {
      // Deliver message to the platform
    },
    async disconnect() {
      // Clean up resources
    },
  });
}
```

### Creating a Hook

```typescript
---
name: my-hook
description: Runs before every agent response
on: before-reply
---
export async function run({ message, context }) {
  // Modify context or message before LLM call
  return context;
}
```

---

## Testing Architecture

| Config File | Scope |
|-------------|-------|
| `vitest.unit.config.ts` | Unit tests (fast, no I/O) |
| `vitest.gateway.config.ts` | Gateway integration tests (real WebSocket server) |
| `vitest.channels.config.ts` | Channel adapter tests |
| `vitest.extensions.config.ts` | Extension tests |
| `vitest.e2e.config.ts` | End-to-end tests |
| `vitest.live.config.ts` | Live tests (real credentials required) |

**Test patterns:**

- `*.test.ts` -- unit or integration
- `*.e2e.test.ts` -- end-to-end
- `*.live.test.ts` -- live/integration (gated by `OPENCLAW_LIVE_TEST=1`)
- `*.test-harness.ts` -- reusable test harness factories
- `*.mocks.ts` -- module mocks

---

## Build System

```
pnpm build
  +-- scripts/tsdown-build.mjs     # Runs tsdown (Rollup bundler)
  |     +-- src/index.ts           -> dist/index.js
  |     +-- src/entry.ts           -> dist/entry.js
  |     +-- src/cli/daemon-cli.ts  -> dist/cli/daemon-cli.js
  |     +-- src/plugin-sdk/*.ts    -> dist/plugin-sdk/*.js
  |     +-- src/extensionAPI.ts    -> dist/extensionAPI.js
  +-- scripts/write-build-info.ts  # Embeds version + git SHA
  +-- scripts/write-cli-compat.ts  # Writes legacy CLI shim compatibility table
  +-- pnpm ui:build                # Vite builds the web UI
```

**Entry binary:** `openclaw.mjs` (shipped to npm) references `dist/entry.js`.

---

## Distribution

- npm/pnpm package: `openclaw`
- Version: `vYYYY.M.D` (e.g., `v2026.3.11`)
- Release channels: `latest` (stable), `beta` (prereleases), `dev` (moving head of `main`)
- Daemon installer: launchd user service (macOS), systemd user unit (Linux)

---

## Performance Considerations

1. **Lazy Loading:** Gateway and agents loaded on-demand
2. **Streaming:** Agent responses streamed token-by-token to channels
3. **Debouncing:** Inbound message debouncing to reduce redundant processing
4. **Caching:** Embeddings and memory cached between requests
5. **Timeouts:** Configurable per-agent execution timeouts
6. **Module compile cache:** Speeds up repeated cold starts

---

## Security

1. **Auth Store:** Encrypted credential storage (`src/secrets/`)
2. **Read-Only Mode:** Audit-safe configuration inspection (`secrets audit`)
3. **Input Sanitization:** Message content sanitization against prompt injection
4. **Token Refresh:** Automatic OAuth token rotation with cooldown
5. **Allow Lists:** Phone number / user ID allow-list enforcement
6. **Operator Scope:** Per-operator permission boundaries

---

## Key Dependencies

| Package | Role |
|---------|------|
| `commander` | CLI argument parsing |
| `grammy` | Telegram bot framework |
| `@buape/carbon` (discord.js wrapper, **never update**) | Discord client |
| `@slack/bolt` | Slack Bolt app framework |
| `@whiskeysockets/baileys` | WhatsApp Web protocol |
| `@line/bot-sdk` | LINE Messaging API |
| `@larksuiteoapi/node-sdk` | Feishu / Lark SDK |
| `hono` | HTTP server (gateway) |
| `ws` | WebSocket server/client |
| `@sinclair/typebox` | Runtime JSON schema validation |
| `zod` | Input validation |
| `yaml` | YAML config file parsing |
| `sharp` | Image processing |
| `playwright-core` | Browser automation |
| `pdfjs-dist` | PDF processing |
| `sqlite-vec` | SQLite vector extension for memory |
| `@mariozechner/pi-*` | Pi TUI and agent library |
| `@clack/prompts` | Interactive CLI prompts |
| `osc-progress` | Progress indicators |
| `croner` | Cron scheduling |
| `jiti` | TypeScript module loader (for hooks) |
| `tslog` | Structured logging |
| `chalk` | Terminal colors |

