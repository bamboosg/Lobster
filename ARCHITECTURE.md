# OpenClaw Architecture

## Overview

OpenClaw is a **personal AI assistant** that runs on your own devices and integrates with multiple messaging platforms (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, and 15+ others). The system is built around a central **Gateway** that orchestrates agent interactions and message routing across all connected channels.

**Core Technology Stack:**
- Runtime: Node.js ≥22
- Language: TypeScript
- Package Managers: npm, pnpm, or bun
- Build/Runtime Optimization: Module compile cache, code splitting

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI/ENTRY POINT                          │
│  (entry.ts → index.ts → cli/program.ts)                        │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├─────────────────────────────────────────┐
             │                                         │
             ▼                                         ▼
    ┌──────────────────┐                    ┌──────────────────┐
    │   GATEWAY        │                    │   COMMANDS       │
    │  (Multi-channel  │                    │  (CLI commands)  │
    │   message hub)   │                    │  - agents        │
    └──────────────────┘                    │  - auth          │
             │                              │  - config        │
             │                              └──────────────────┘
             ▼
    ┌─────────────────────────────────────────┐
    │          MESSAGE ROUTING                │
    │   (resolve-route.ts, bindings.ts)      │
    └──────────────────┬──────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    ┌────────────┐ ┌──────────┐ ┌──────────────┐
    │ CHANNELS   │ │ AGENTS   │ │ PROVIDERS    │
    │ (Telegram, │ │ (Model   │ │ (Auth, LLM   │
    │ Discord,   │ │ execution)│ │ integrations)│
    │ Slack, etc)│ │          │ │              │
    └────────────┘ └──────────┘ └──────────────┘
```

---

## Core Modules

### 1. **CLI & Entry Points** (`src/cli/`, `src/entry.ts`, `src/index.ts`)

**Purpose:** Command-line interface and application bootstrap.

**Key Files:**
- `entry.ts` - Main entry wrapper (spawning, argument normalization, respawn policy)
- `index.ts` - CLI exports and initialization
- `cli/program.ts` - Commander.js program definition
- `cli/argv.ts` - CLI argument parsing and validation
- `cli/profile.ts` - CLI profile management (debug profiles)
- `cli/run-main.js` - CLI execution entry point
- `cli/windows-argv.ts` - Windows argument normalization
- `cli/respawn-policy.ts` - Node.js respawn/restart logic for experimental features
- `cli/prompt.ts` - User prompts (yes/no dialogs)
- `cli/deps.ts` - Default dependencies initialization

**Key Functions:**
- `buildProgram()` - Builds the Commander program with all commands
- `normalizeWindowsArgv()` - Windows CLI argument handling
- `parseCliProfileArgs()` - Parses CLI profile flags
- Entry point respawn logic for Node.js experimental warnings

---

### 2. **Gateway** (`src/gateway/`)

**Purpose:** Central message hub orchestrating all channel integrations and agent communication.

**Key Files:**
- `boot.ts` - Gateway bootstrap and initialization
- `auth.ts` - Authentication and token management for channels
- `call.ts` - Voice/call handling
- `chat-abort.ts` - Chat cancellation/abort logic
- `chat-sanitize.ts` - Input sanitization
- `channel-health-monitor.ts` - Monitor channel connectivity/health
- `channel-health-policy.ts` - Health check policies
- `channel-status-patches.ts` - Status patch application
- `agent-event-assistant-text.ts` - Agent event streaming

**Key Responsibilities:**
- Listen on configured ports (default 18789)
- Route inbound messages to appropriate agents
- Distribute agent responses back to source channels
- Manage authentication state across channels
- Monitor channel health and connectivity
- Buffer and deduplicate messages
- Handle voice/audio transcription and synthesis

---

### 3. **Agents** (`src/agents/`)

**Purpose:** Execute AI models and process conversations with tool/function calling.

**Key Components:**

**Agent Execution:**
- `agent-scope.ts` - Agent workspace/directory resolution
- `agent-paths.ts` - Path management for agent files
- `identity.ts` - Agent identity configuration (name, avatar, etc.)
- `model-selection.ts` - Model and provider selection logic
- `timeout.ts` - Agent execution timeout settings
- `workspace.ts` - Agent workspace setup and validation
- `defaults.ts` - Default models and providers

**Provider Integration:**
- `auth-profiles.ts` - Manage authentication profiles for providers
- `api-key-rotation.ts` - API key rotation and refresh logic
- `auth-health.ts` - Monitor authentication health
- `apply-patch.ts` - Dynamic patch updates to authentication

**Advanced Features:**
- `acp-spawn.ts` - ACP (Agent Communication Protocol) spawning
- `anthropic-payload-log.ts` - Debug logging for Anthropic payloads
- `announce-idempotency.ts` - Idempotency support
- `tool-result-*` - Tool/function result processing

---

### 4. **Routing** (`src/routing/`)

**Purpose:** Resolve and manage message routing between channels and agents.

**Key Files:**
- `resolve-route.ts` - Core routing resolution logic (largest file ~24KB)
- `account-id.ts` - Account identifier resolution
- `account-lookup.ts` - Account lookup utilities
- `bindings.ts` - Channel-to-account bindings
- `session-key.ts` - Session key generation and management
- `session-key.continuity.ts` - Session continuity across messages
- `default-account-warnings.ts` - Warning messages for default accounts

**Key Concepts:**
- **Route Resolution:** Determines which agent/account should handle a message
- **Session Keys:** Track conversation context across messages
- **Bindings:** Map channels to specific user accounts
- **Account Lookup:** Find the right user/agent for inbound messages

---

### 5. **Channels** (`src/channels/`)

**Purpose:** Message channel implementations (WhatsApp, Telegram, Slack, Discord, etc.).

**Core Channel Features:**
- `channel-config.ts` - Channel configuration schema
- `account-summary.ts` - Account summary information
- `account-snapshot-fields.ts` - Account field snapshots
- `chat-type.ts` - Chat type determination (DM, group, etc.)
- `conversation-label.ts` - Label management for conversations
- `dock.ts` - Docking/pinning features
- `location.ts` - Geographic location handling
- `mention-gating.ts` - Control mentions in messages
- `model-overrides.ts` - Channel-specific model overrides
- `command-gating.ts` - Gate commands by channel

---

### 6. **Integration Channels** (Messaging Platforms)

#### **Telegram** (`src/telegram/`)
- `accounts.ts` - Telegram account management
- `account-inspect.ts` - Account inspection
- `bot-message-context.ts` - Message context extraction
- `bot-handlers.ts` - Message/update handlers
- `api-logging.ts` - API call logging
- `send.ts` - Message sending
- `format.ts` - Message formatting

#### **Discord** (`src/discord/`)
- `accounts.ts` - Discord account/guild management
- `account-inspect.ts` - Server/guild inspection
- `client.ts` - Discord.js client wrapper
- `guilds.ts` - Guild management
- `mentions.ts` - Mention parsing
- `monitor.ts` - Event monitoring
- `api.ts` - Discord API integration
- `components.ts` - Interactive components (buttons, select menus)

#### **Slack** (`src/slack/`)
- `account-inspect.ts` - Workspace/channel inspection
- `accounts.ts` - Account management
- `client.ts` - Bolt framework client wrapper
- `directory-live.ts` - Live directory updates
- `blocks.ts` - Block Kit rendering
- `actions.ts` - Action handling
- `monitor.ts` - Event listening

#### **Signal** (`src/signal/`)
- `client.ts` - Signal protocol client
- `daemon.ts` - Signal daemon management
- `format.ts` - Message formatting with chunking
- `send.ts` - Message sending
- `send-reactions.ts` - Reaction sending
- `identity.ts` - Signal identity verification
- `monitor.ts` - Inbound message monitoring
- `probe.ts` - Signal availability probing

#### **WhatsApp** (`src/whatsapp/`)
- `normalize.ts` - JID normalization
- `resolve-outbound-target.ts` - Resolve sending target

---

### 7. **Providers** (`src/providers/`)

**Purpose:** LLM/AI model integrations with authentication.

**Authentication:**
- `github-copilot-auth.ts` - GitHub Copilot OAuth
- `github-copilot-token.ts` - Copilot token refresh
- `github-copilot-models.ts` - Available Copilot models
- `qwen-portal-oauth.ts` - Alibaba Qwen OAuth

**Provider Utilities:**
- `google-shared.ts` - Google/Gemini common utilities
- `kilocode-shared.ts` - KiloCode provider utilities

---

### 8. **Plugin SDK** (`src/plugin-sdk/`)

**Purpose:** Public API for plugin/extension developers.

**Exports:**
- `account-id.ts` - Account ID types
- `account-resolution.ts` - Resolve account contexts
- `acpx.ts` - Extended ACP protocol
- `channel-config-helpers.ts` - Channel configuration utilities
- `channel-lifecycle.ts` - Channel event lifecycle
- `core.ts` - Core SDK types and functions
- `fetch-auth.ts` - Fetch auth context
- `group-access.ts` - Group access control
- `index.ts` - Main SDK entry point
- `compat.ts` - Backwards compatibility layer

---

### 9. **Commands** (`src/commands/`)

**Purpose:** Agent, auth, channel, and configuration CLI commands.

**Command Groups:**
- `agents.ts` - Agent commands (list, add, bind, delete, identity)
- `agents.commands.*.ts` - Individual agent command implementations
- `agents.bindings.ts` - Binding configuration
- `agents.providers.ts` - Provider configuration
- `auth-choice*.ts` - Auth selection and application (OAuth, API keys)
- `auth-choice.apply*.ts` - Provider-specific auth application

---

### 10. **Hooks System** (`src/hooks/`)

**Purpose:** Extensibility points for agent behavior.

**Key Files:**
- `hooks.ts` - Hook registration and execution
- `config.ts` - Hook configuration
- `hooks-install.ts` - Hook installation
- `hooks-status.ts` - Hook status reporting
- `bundled-dir.ts` - Bundled hooks directory resolution
- `gmail.ts` - Gmail integration hooks
- `gmail-watcher.ts` - Gmail change watchers
- `frontmatter.ts` - Script frontmatter parsing
- `import-url.ts` - URL-based hook imports
- `install.ts` - Installation utilities

---

### 11. **Memory System** (`src/memory/`)

**Purpose:** Embeddings, semantic search, and memory management.

**Key Components:**
- `backend-config.ts` - Memory backend configuration
- `batch-*.ts` - Batch embedding processing (OpenAI, Gemini, Voyage)
- `embedding-*.ts` - Embedding model management and limits
- `embeddings-*.ts` - Embeddings utilities and debug helpers

---

### 12. **Pairing System** (`src/pairing/`)

**Purpose:** Device pairing for iMessage/BlueBubbles/Signal.

**Key Files:**
- `pairing-store.ts` - Pairing state persistence (~26KB)
- `setup-code.ts` - Generate/validate setup codes (~11KB)
- `pairing-challenge.ts` - Challenge-response pairing
- `pairing-messages.ts` - Pairing message formatting
- `pairing-labels.ts` - Pairing state labels

---

### 13. **Configuration** (`src/config/`)

**Purpose:** Agent configuration, paths, and validation.

**Key Files:**
- `config.ts` - Main configuration loading
- `agent-dirs.ts` - Agent directory resolution
- `agent-limits.ts` - Agent concurrency and resource limits
- `backup-rotation.ts` - Configuration backups
- `bindings.ts` - Channel-account bindings config
- `channel-capabilities.ts` - Feature detection per channel
- `commands.ts` - Command configuration
- `config-paths.ts` - Configuration file paths
- Various feature configs: discord, hooks, identity, env-vars, etc.

---

### 14. **Shared Utilities** (`src/shared/`)

**Purpose:** Common types and utilities across modules.

**Key Modules:**
- `assistant-identity-values.ts` - Identity enumeration
- `avatar-policy.ts` - Avatar selection logic
- `chat-*.ts` - Chat message/content types
- `device-auth.ts` - Device authentication types
- `session-*.ts` - Session types and utilities
- `requirements.ts` - Runtime requirement checks
- `config-eval.ts` - Configuration evaluation
- `operator-scope-compat.ts` - Operator scope compatibility

---

### 15. **Infrastructure** (`src/infra/`)

**Purpose:** Low-level OS/environment utilities.

**Categories:**

**Binary Management:**
- `binaries.ts` - Download/manage external binaries
- `bonjour*.ts` - mDNS/Bonjour service discovery
- `brew.ts` - Homebrew package manager integration

**Environment:**
- `env.js` - Environment variable normalization
- `dotenv.js` - .env file loading
- `windows-argv.ts` - Windows-specific argument handling

**Execution:**
- `exec.ts` - Child process execution
- `abort-signal.ts` - Abort signal handling
- `agent-events.ts` - Agent event emission
- `archive.ts` - Archive/tar handling
- `backoff.ts` - Exponential backoff

**Network:**
- `ports.ts` - Port availability checking
- `bonjour-discovery.ts` - Service discovery

**System:**
- `runtime-guard.ts` - Node.js version validation
- `is-main.ts` - Entry point detection
- `path-env.ts` - PATH environment management
- `warning-filter.ts` - Process warning filtering
- `unhandled-rejections.ts` - Unhandled rejection handler

---

### 16. **Media Processing** (`src/media/`)

**Purpose:** Audio/video/image processing.

**Key Files:**
- `audio.ts` - Audio processing (recording, playback)
- `audio-tags.ts` - Audio metadata tags
- `image-ops.ts` - Image manipulation
- `ffmpeg-exec.ts` - FFmpeg command execution
- `ffmpeg-limits.ts` - FFmpeg resource limits
- `base64.ts` - Base64 encoding/decoding
- `fetch.ts` - Media fetching utilities
- `input-files.ts` - Media input file handling
- `pdf-extract.ts` - PDF text extraction
- `mime.ts` - MIME type detection

---

## Core Files

### `src/runtime.ts` - Runtime Environment
**Purpose:** Abstraction for process I/O (logging, exit).

**Exports:**
```typescript
type RuntimeEnv = {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
};

const defaultRuntime: RuntimeEnv;
function createNonExitingRuntime(): RuntimeEnv;
```

---

### `src/logger.ts` - Structured Logging
**Purpose:** Main logging interface with runtime integration.

**Functions:**
- `logInfo(message: string, runtime?: RuntimeEnv)` - Info logs
- `logWarn(message: string, runtime?: RuntimeEnv)` - Warning logs
- `logSuccess(message: string, runtime?: RuntimeEnv)` - Success logs
- `logError(message: string, runtime?: RuntimeEnv)` - Error logs
- `logDebug(message: string)` - Debug logs (file + verbose console)

**Features:**
- Subsystem-based logging (e.g., `"telegram: message received"`)
- Integrated with runtime for terminal control
- Structured logging to file with level filtering

---

### `src/globals.ts` - Global State
**Purpose:** CLI state management.

**State Variables:**
- `globalVerbose` - Verbose mode flag
- `globalYes` - Auto-confirm mode flag

**Functions:**
- `setVerbose(v: boolean)` / `isVerbose()`
- `setYes(v: boolean)` / `isYes()`
- `logVerbose(message: string)` - Verbose console logging
- `success`, `warn`, `info`, `danger` - Themed output functions

---

### `src/extensionAPI.ts` - Plugin SDK Exports
**Purpose:** Public API for plugin developers.

**Main Exports:**
```typescript
export { resolveAgentDir, resolveAgentWorkspaceDir } from "./agents/agent-scope";
export { DEFAULT_MODEL, DEFAULT_PROVIDER } from "./agents/defaults";
export { resolveAgentIdentity } from "./agents/identity";
export { runEmbeddedPiAgent } from "./agents/pi-embedded";
export { resolveAgentTimeoutMs } from "./agents/timeout";
export { ensureAgentWorkspace } from "./agents/workspace";
export {
  resolveStorePath,
  loadSessionStore,
  saveSessionStore,
  resolveSessionFilePath,
} from "./config/sessions";
```

---

### `src/index.ts` - Main Entry Point (Browser)
**Purpose:** CLI program export.

**Exports:**
- `buildProgram()` - Commander CLI program

**Includes:**
- Auto-reply functionality
- Web channel monitoring
- Configuration management
- Session handling

---

### `src/entry.ts` - Main Entry Point (Node.js)
**Purpose:** CLI bootstrap with respawn logic.

**Responsibilities:**
1. Environment normalization
2. Compile cache enablement
3. Experimental warning suppression via respawn
4. CLI profile application
5. Version and help fast-paths
6. Error handling

---

## Message Flow Architecture

### Inbound Message Flow
```
1. Channel receives message (Telegram, Discord, Slack, etc.)
   ↓
2. Channel adapter normalizes to internal format
   ↓
3. Gateway receives normalized message
   ↓
4. Resolve routing (resolve-route.ts) determines:
   - Which agent should handle it
   - Session continuity
   - Account binding
   ↓
5. Message sent to Agent
   ↓
6. Agent processes with LLM
   ↓
7. Response generated
   ↓
8. Response distributed back to source channel
   ↓
9. Channel adapter sends to original platform
```

### Session & Account Management
- **Account ID:** Unique identifier for user/account
- **Session Key:** Generated from message metadata (sender, chat ID, etc.)
- **Bindings:** Map (channel, remote_account_id) → local_account
- **Continuity:** Reuse same session key for follow-ups in same conversation

---

## Authentication Architecture

### Provider Authentication Flow
1. **OAuth:** GitHub Copilot, Qwen Portal (refresh token + access token)
2. **API Keys:** OpenAI, Anthropic, Google, others
3. **Auth Rotation:** Multiple profiles with cooldown/failover
4. **Health Checks:** Monitor authentication validity

### Channel Authentication
- Per-channel credentials (tokens, API keys, OAuth)
- Stored in secure auth store
- Read-only mode for auditing (`--no-color`, `secrets audit`)

---

## Extension System

### Hooks
- Directory-based: `~/.openclaw/hooks/`
- Frontmatter-based configuration
- URL imports supported
- Lifecycle: install, status, execution

### Plugin SDK
- Public exports: agent scope, session management, channel config
- Type definitions included
- Backwards compatibility layer

---

## Configuration Schema

### Directory Structure
```
~/.openclaw/
├── config.yaml          # Main configuration
├── agents/              # Agent definitions
│   ├── my-agent/
│   │   └── config.yaml
├── sessions/            # Session storage
├── hooks/               # Custom hooks
└── pairing/             # Device pairing data
```

### Channel Configuration
- Credentials per channel
- Model overrides
- Mention/command gating
- Conversation labels

---

## Testing Architecture

- **Test Files:** `*.test.ts` and `*.spec.ts`
- **Test Patterns:** Unit, integration, E2E
- **Coverage:** Auth, routing, channel adapters, agent execution
- **Test Helpers:** Mock factories, fixtures, harnesses

---

## Build & Deployment

### Build System
- TypeScript compilation → JavaScript
- Code splitting for efficiency
- Module compile cache for faster startup
- Single binary wrapper: `openclaw.mjs`

### Distribution
- npm/pnpm packages
- Version: `vYYYY.M.D` (e.g., `v2026.3.11`)
- Channels: `latest`, `beta`, `dev`
- Daemon: launchd (macOS) / systemd (Linux)

---

## Performance Considerations

1. **Lazy Loading:** Gateway and agents loaded on-demand
2. **Streaming:** Agent responses streamed to channels
3. **Debouncing:** Inbound message debouncing to reduce redundant processing
4. **Caching:** Embeddings and memory cached
5. **Timeouts:** Configurable per-agent execution timeouts

---

## Security

1. **Auth Store:** Encrypted credential storage
2. **Read-Only Mode:** Audit-safe configuration inspection
3. **Input Sanitization:** Message content sanitization
4. **Token Refresh:** Automatic OAuth token rotation
5. **Process Isolation:** Channel handlers run with limited scope

---

## Key Development Workflow

### Adding a New Channel
1. Create `src/my-channel/` directory
2. Implement: `client.ts`, `accounts.ts`, `send.ts`, `monitor.ts`
3. Register in gateway message routing
4. Add configuration schema
5. Implement tests

### Adding an LLM Provider
1. Create auth in `src/providers/`
2. Implement provider integration in agents module
3. Add to auth selection flow
4. Configure model mapping
5. Add fallback/rotation support

### Creating a Plugin
1. Use Plugin SDK from `dist/plugin-sdk/`
2. Hook into system via `src/hooks/`
3. Access session/config via public API
4. Distribute as npm package or local file

---

## Dependencies & Tooling

- **Runtime:** Node.js ≥22
- **Package Managers:** npm, pnpm, bun
- **Testing:** Vitest
- **CLI:** Commander.js
- **Logging:** Structured (file + console)
- **Platform Libraries:** discord.js, node-telegram-bot-api, @slack/bolt, signal-node, etc.

