# Source Code Module Reference

This document describes each feature module under `src/` and explains its purpose based on the source files it contains.

---

## Table of Contents

- [Entry Points](#entry-points)
- [Core Platform](#core-platform)
  - [agents](#agents)
  - [gateway](#gateway)
  - [channels](#channels)
  - [cli](#cli)
  - [commands](#commands)
  - [config](#config)
  - [sessions](#sessions)
  - [routing](#routing)
  - [auto-reply](#auto-reply)
- [AI & Intelligence](#ai--intelligence)
  - [context-engine](#context-engine)
  - [memory](#memory)
  - [providers](#providers)
  - [link-understanding](#link-understanding)
  - [media-understanding](#media-understanding)
- [Messaging Channels](#messaging-channels)
  - [telegram](#telegram)
  - [discord](#discord)
  - [slack](#slack)
  - [signal](#signal)
  - [imessage](#imessage)
  - [whatsapp](#whatsapp)
  - [line](#line)
  - [web](#web)
- [Extensibility](#extensibility)
  - [plugin-sdk](#plugin-sdk)
  - [plugins](#plugins)
  - [hooks](#hooks)
  - [acp](#acp)
- [Infrastructure](#infrastructure)
  - [infra](#infra)
  - [daemon](#daemon)
  - [process](#process)
  - [node-host](#node-host)
  - [security](#security)
  - [secrets](#secrets)
  - [pairing](#pairing)
  - [cron](#cron)
  - [logging](#logging)
- [Media & UI](#media--ui)
  - [media](#media)
  - [browser](#browser)
  - [canvas-host](#canvas-host)
  - [tts](#tts)
  - [terminal](#terminal)
  - [tui](#tui)
  - [markdown](#markdown)
  - [wizard](#wizard)
- [Shared Utilities](#shared-utilities)
  - [shared](#shared)
  - [types](#types)
  - [utils](#utils)
  - [i18n](#i18n)
  - [compat](#compat)

---

## Entry Points

### `src/entry.ts`

The CLI binary entry point. It handles:

- Respawning the Node process with `--disable-warning=ExperimentalWarning` if needed.
- Applying compile-cache optimisation (`enableCompileCache`).
- Normalising Windows argument quoting.
- Fast-path handling for `--version` and `--help` without loading the full CLI.
- Delegating to `cli/run-main.ts` for all other invocations.

### `src/index.ts`

Convenience index used by the gateway-embedded path and tests. It bootstraps the environment (dotenv, env normalisation, console-capture) and re-exports CLI program constructs.

### `src/runtime.ts`

Defines the `RuntimeEnv` interface (log, error, exit) and the `defaultRuntime` singleton used throughout the codebase to abstract Node process I/O so tests can inject mock runtimes without spawning processes.

### `src/globals.ts`

Thin wrappers around `@clack/prompts` coloured output helpers (`info`, `warn`, `danger`, `success`, `logVerboseConsole`) and the verbose-logging flag. Used everywhere that needs simple terminal output.

### `src/version.ts`

Single source of truth for the package version string (`VERSION`), parsed from `package.json` at build time.

### `src/logger.ts`

Gateway-aware console override. Detects a `subsystem: message` prefix pattern and routes log lines to per-subsystem structured loggers (`logging/subsystem.ts`) while forwarding everything else to the default runtime log.

### `src/logging.ts`

Top-level logging bootstrap: installs the console capture bridge that intercepts `console.log/warn/error` and feeds them into the structured logging pipeline.

### `src/utils.ts`

Root-level utility functions used across many modules: filesystem helpers (`ensureDir`, `pathExists`), number clamping, home-directory expansion, E.164 phone-number normalisation, WhatsApp JID conversion, web-channel assertion, and a small object-merge utility.

### `src/polls.ts` and `src/poll-params.ts`

Cross-channel poll support types and helpers. `polls.ts` defines the canonical `PollInput` and `NormalizedPollInput` types and the logic to normalise max-selection counts per channel. `poll-params.ts` declares the named parameter definitions (`pollQuestion`, `pollOption`, `pollDurationHours`, …) and the parser that reads them from agent tool-call payloads.

### `src/channel-web.ts`

Barrel / entry adapter for the WhatsApp Web channel. Re-exports the `createWaSocket`, `loginWeb`, and `monitorWebChannel` helpers from `channels/web/` for backward compatibility.

### `src/extensionAPI.ts`

Minimal public surface that extensions import to register themselves with the gateway at runtime.

---

## Core Platform

### `agents`

**Path:** `src/agents/`  
**Purpose:** The AI agent runtime — the heart of OpenClaw.

Key responsibilities:

- **Embedded Pi Agent** (`pi-embedded.ts`, `pi-embedded-runner/`) — runs the `@mariozechner/pi-agent-core` LLM loop inside the gateway process, manages tool calls, streaming replies, and context compaction.
- **Model selection & auth** (`model-selection.ts`, `model-auth.ts`, `api-key-rotation.ts`) — resolves which model to use, picks the best auth profile from the rotation pool, and handles failover between providers.
- **Auth profiles** (`auth-profiles/`) — stores, updates, and rotates OAuth tokens and API-key credentials; implements last-used/last-good ordering heuristics and cooldown back-off.
- **Tool catalog** (`tools/`) — defines every tool available to the agent (shell execution, browser control, memory search, file I/O, etc.) and dispatches tool calls.
- **System prompt** (`system-prompt.ts`) — assembles the system prompt from workspace config, agent persona, channel context, and installed skills.
- **Subagent spawning** (`acp-spawn.ts`, `acp-spawn-parent-stream.ts`) — launches child agents over the ACP protocol and streams their output back.
- **Anthropic payload helpers** (`anthropic-payload-log.ts`, `anthropic.setup-token.live.test.ts`) — request/response logging and OAuth token bootstrapping for Anthropic models.
- **Context & compaction** — delegates to `context-engine` for building and compacting the conversation window.

### `gateway`

**Path:** `src/gateway/`  
**Purpose:** The WebSocket control plane that connects channels, sessions, and agents.

Key responsibilities:

- **Server** (`server.ts`) — starts the HTTP/WebSocket gateway, wires middleware, and owns the event loop.
- **Session management** (`server-sessions.ts`) — creates, restores, and expires sessions; enforces concurrency limits.
- **Channel orchestration** (`server-channels.ts`) — starts/stops/monitors all configured channel adapters; broadcasts channel-health events.
- **Chat pipeline** (`server-chat.ts`, `chat-abort.ts`, `chat-attachments.ts`) — receives inbound messages, sanitises them, resolves the target agent, invokes the Pi Agent, and streams the reply back.
- **Authentication** (`auth.ts`, `auth-mode-policy.ts`) — validates gateway tokens, applies pairing requirements, and enforces per-channel DM policies.
- **Webhook support** — accepts inbound webhooks and routes them to channel handlers.
- **Cron integration** (`server-cron.ts`) — registers cron deliveries against the agent runtime.
- **Channel health monitoring** (`channel-health-monitor.ts`, `channel-health-policy.ts`) — tracks reconnect state and surfaces degraded-channel warnings.
- **Boot** (`boot.ts`) — ordered startup sequence: load config → init logging → start channels → bind WebSocket.

### `channels`

**Path:** `src/channels/`  
**Purpose:** The unified messaging channel interface shared by all channel adapters.

Key responsibilities:

- **Channel registry** — registers and enumerates every available channel type at startup.
- **Account management** (`account-snapshot-fields.ts`, `account-summary.ts`) — normalises per-channel account metadata into a common shape.
- **Allowlists** (`allowlists/`, `allowlist-match.ts`, `allow-from.ts`) — stores and evaluates which external senders are permitted to reach the assistant.
- **Command gating** (`command-gating.ts`) — decides which slash commands are visible on each channel type.
- **Channel config** (`channel-config.ts`) — typed schema for channel-level configuration keys.
- **Conversation labelling** (`conversation-label.ts`) — generates stable, human-readable labels for conversations.
- **Dock** (`dock.ts`) — the channel lifecycle interface (start, stop, status, health-probe).
- **Web channel adapter** (`web/`) — WebSocket-based web chat channel.

### `cli`

**Path:** `src/cli/`  
**Purpose:** The command-line interface framework and all CLI sub-command handlers.

Key responsibilities:

- **Program builder** (`program.ts`) — builds the root Commander.js program and registers every sub-command.
- **Run-main** (`run-main.ts`) — top-level CLI runner: parses args, selects profile, runs the command, and handles exit.
- **Argv utilities** (`argv.ts`) — small helpers for detecting `--version`, `--help`, and profile flags before the full Commander parse.
- **Dependencies** (`deps.ts`) — `createDefaultDeps` factory that injects channel-send runtimes (Discord, Telegram, Slack, Signal, iMessage, WhatsApp) into commands via lazy dynamic import.
- **Channel auth** (`channel-auth.ts`) — implements the `openclaw channels auth` flow for each provider.
- **Browser CLI** (`browser-cli*.ts`) — sub-commands for browser automation: navigate, inspect, resize, screenshot.
- **Node / device CLI** (`node-cli.ts`, `nodes-cli.ts`, `devices-cli.ts`) — manage remote nodes and paired devices.
- **Profile** (`profile.ts`) — `--profile` flag support for per-profile config/secrets isolation.
- **Progress** (`progress.ts`) — spinner / progress-bar helpers built on `@clack/prompts`.
- **Prompt utilities** (`prompt.ts`) — `promptYesNo` and other interactive prompts.
- **Plugin & skill CLIs** (`plugins-cli.ts`, `skills-cli.ts`) — install, list, and remove plugins/skills.

### `commands`

**Path:** `src/commands/`  
**Purpose:** Business logic for every top-level CLI command.

Key responsibilities:

- **`gateway`** — start/stop/status commands for the gateway process.
- **`agent`** — run the assistant directly from the CLI (`openclaw agent --message "..."`).
- **`message send`** — send outbound messages to a channel contact.
- **`onboard`** / `wizard` — interactive setup wizard command.
- **`channels`** — list, add, remove, and probe channels.
- **`secrets`** — read, write, and audit secrets.
- **`memory`** — search and manage the vector memory store.
- **`models`** — list and configure AI model providers.
- **`hooks`** — manage gateway lifecycle hooks.
- **`cron`** — manage scheduled tasks.
- **`update`** — self-update the CLI binary.
- **`doctor`** — run diagnostics and surface configuration issues.
- **`logs`** — tail and filter gateway logs.
- **`exec-approvals`** — review and approve pending shell-command executions.

### `config`

**Path:** `src/config/`  
**Purpose:** All configuration loading, validation, and path resolution.

Key responsibilities:

- **`config.ts`** — loads `openclaw.config.yaml` (or JSON) from disk, validates with Zod, merges env-variable overrides, and exposes the typed `OpenClawConfig` object.
- **`paths.ts`** — canonical paths: config dir, sessions dir, credentials dir, OAuth dir, log dir.
- **`sessions.ts`** — loads/saves the session store (a JSON file mapping session keys to session metadata).
- **`agent-dirs.ts`** — resolves per-agent workspace and tool directories.
- **`channel-capabilities.ts`** — per-channel feature flags derived from config.
- **`commands.ts`** — per-channel slash-command configuration.
- **`bindings.ts`** — ACP binding configuration (which external agent handles which channel).
- **`allowed-values.ts`** — enum validation for typed config fields.
- **`backup-rotation.ts`** — rolling config-file backup logic.

### `sessions`

**Path:** `src/sessions/`  
**Purpose:** Session lifecycle and metadata.

- **`session-id.ts`** — generates and validates session identifiers.
- **`session-key-utils.ts`** — derives session keys from channel + account context.
- **`session-label.ts`** — generates human-readable session labels.
- **`level-overrides.ts`** / **`model-overrides.ts`** — per-session overrides for log-level and model.
- **`send-policy.ts`** — controls whether a session may send outbound messages.
- **`input-provenance.ts`** — tracks whether an input originated from a human or a scheduled task.
- **`transcript-events.ts`** — typed events emitted to the session transcript (user turn, assistant turn, tool call, …).

### `routing`

**Path:** `src/routing/`  
**Purpose:** Resolves which agent session should handle an inbound message.

- **`resolve-route.ts`** — main routing logic: looks up the account, applies group rules, and returns the target session key.
- **`account-id.ts`** / **`account-lookup.ts`** — normalise and cache channel account identifiers.
- **`session-key.ts`** — routing-level session-key derivation (distinct from `sessions/session-key-utils.ts`).
- **`bindings.ts`** — ACP-binding routing: redirects certain accounts to an external ACP agent.
- **`default-account-warnings.ts`** — emits a warning when routing falls back to the default account.

### `auto-reply`

**Path:** `src/auto-reply/`  
**Purpose:** Generates and dispatches automatic replies without invoking the full agent loop.

Key responsibilities:

- **Commands registry** (`commands-registry.ts`) — stores all registered slash commands (built-in and plugin-provided).
- **Command detection** (`command-detection.ts`) — parses inbound messages for slash-command prefixes.
- **Command dispatch** (`dispatch.ts`) — routes a detected command to its handler and formats the reply.
- **Templating** (`templating.ts`) — simple `{{variable}}` substitution for reply templates.
- **Reply** (`reply.ts`) — top-level `getReplyFromConfig` function that checks for auto-reply rules and returns a pre-canned reply.
- **Envelope** (`envelope.ts`) — wraps a reply payload with channel metadata before delivery.
- **Fallback state** (`fallback-state.ts`) — tracks whether the agent loop is unavailable and auto-reply should take over.
- **Heartbeat** (`heartbeat-reply-payload.ts`) — ping/pong payload for keep-alive probes.

---

## AI & Intelligence

### `context-engine`

**Path:** `src/context-engine/`  
**Purpose:** Abstraction layer for building and compacting the LLM context window.

- **`registry.ts`** — factory registry; plugins can register alternative context engines.
- **`legacy.ts`** — the default context engine backed by the `@mariozechner/pi-agent-core` compaction algorithm.
- **`init.ts`** — initialises all registered engines at gateway boot.
- **Types** (`types.ts`) — `ContextEngine`, `AssembleResult`, `CompactResult`, `IngestResult`.

### `memory`

**Path:** `src/memory/`  
**Purpose:** Vector-database memory: embed, store, and search conversation history and documents.

Key responsibilities:

- **Manager** (`manager.ts`) — the central `EmbeddingManager` that drives indexing, search, and compaction; uses SQLite + `sqlite-vec` as the default backend.
- **Embeddings** (`embeddings*.ts`) — provider adapters for OpenAI, Gemini, Mistral, Voyage, Ollama, and a remote HTTP backend.
- **Batch processing** (`batch-*.ts`) — chunked embedding of large documents with per-provider rate-limit handling.
- **Hybrid search** (`hybrid.ts`) — combines vector similarity with BM25 full-text search.
- **MMR** (`mmr.ts`) — Maximal Marginal Relevance re-ranking to diversify results.
- **Temporal decay** (`temporal-decay.ts`) — down-weights older memories during retrieval.
- **Query expansion** (`query-expansion.ts`) — generates alternative phrasings to improve recall.
- **Session files** (`session-files.ts`) — maps session-transcript files to embedding chunks.

### `providers`

**Path:** `src/providers/`  
**Purpose:** Model-provider–specific authentication and model-listing helpers.

- **GitHub Copilot** (`github-copilot-auth.ts`, `github-copilot-models.ts`, `github-copilot-token.ts`) — OAuth device-flow for Copilot subscriptions, token refresh, and dynamic model enumeration from the Copilot API.
- **Google shared** (`google-shared.*.ts`) — request-transformation helpers ensuring well-formed Gemini payloads (function-call turn ordering, parameter-type normalisation).
- **Kilocode shared** (`kilocode-shared.ts`) — shared request plumbing for the Kilocode provider.
- **Qwen portal OAuth** (`qwen-portal-oauth.ts`) — OAuth flow for the Qwen portal.

### `link-understanding`

**Path:** `src/link-understanding/`  
**Purpose:** Fetches and extracts plain-text content from URLs so the agent can "read" a link.

Handles HTTP fetching, HTML-to-text stripping, content-length guards, and error normalisation into a typed `LinkContent` result.

### `media-understanding`

**Path:** `src/media-understanding/`  
**Purpose:** AI-powered analysis of image, audio, and video attachments.

- Dispatches images to a vision-capable model to produce a text description.
- Transcribes audio using Whisper-compatible APIs.
- Extracts key frames from video for analysis.
- Normalises the result into a `MediaUnderstandingResult` used by the agent to reason about attachments.

---

## Messaging Channels

Each channel module in this section provides the full lifecycle for one messaging platform: connecting, authenticating, receiving inbound messages, sending outbound messages, and handling media attachments.

### `telegram`

**Path:** `src/telegram/`  
**Purpose:** Telegram Bot API integration via the `grammy` library.

Supports text, media (photo, video, document, voice, sticker), polls, inline buttons, reactions, edit/delete, and group chat. Handles long-polling and webhook delivery modes. `TelegramChannel` implements the standard channel dock interface.

### `discord`

**Path:** `src/discord/`  
**Purpose:** Discord bot integration via `discord.js`.

Supports guild text channels, DMs, slash commands, voice-channel join/leave, ephemeral replies, reactions, attachments, and embeds. Includes a bridge server for multi-server routing.

### `slack`

**Path:** `src/slack/`  
**Purpose:** Slack app integration via `@slack/bolt`.

Supports message events, app mentions, DMs, threads, file uploads, Block Kit rich messages, and socket-mode connection. Handles Slack's acknowledgement requirements.

### `signal`

**Path:** `src/signal/`  
**Purpose:** Signal messenger integration via the `signal-cli` binary (or the plugin extension).

Handles sending and receiving text messages, attachments, and reactions over Signal. Phone-number normalisation and end-to-end linked-device management.

### `imessage`

**Path:** `src/imessage/`  
**Purpose:** iMessage / Apple Messages integration (macOS only).

Uses AppleScript to send and receive iMessages from the local Messages app. Supports text, attachments, and group chats.

### `whatsapp`

**Path:** `src/whatsapp/`  
**Purpose:** WhatsApp Web integration via `@whiskeysockets/baileys`.

Re-exports the `createWaSocket` and `loginWeb` / `monitorWebChannel` helpers from `channels/web/` into the `src/whatsapp/` namespace for the plugin SDK.

### `line`

**Path:** `src/line/`  
**Purpose:** LINE messaging platform integration via `@line/bot-sdk`.

Supports text messages, flex messages, quick replies, media messages, and rich menus. Uses the LINE Messaging API webhook.

### `web`

**Path:** `src/web/`  
**Purpose:** Browser-based WebSocket chat channel and web dashboard.

- Serves a single-page web UI (`ui/`) for chatting with the assistant from a browser.
- Provides a REST/WebSocket API for the web frontend.
- Includes QR-code pairing for the web chat session.

---

## Extensibility

### `plugin-sdk`

**Path:** `src/plugin-sdk/`  
**Purpose:** The public SDK that extensions import to register with OpenClaw.

- **`index.ts`** — the main SDK surface: `definePlugin`, `defineChannel`, `defineTool`, `defineSkill`, channel-specific helpers, webhook-target registration, command-auth hooks, and all shared types.
- **Per-channel sub-paths** (`discord.ts`, `telegram.ts`, `slack.ts`, `signal.ts`, `imessage.ts`, `whatsapp.ts`, `line.ts`, `msteams.ts`, `acpx.ts`, `bluebubbles.ts`, …) — channel-specific event types and helper factories exposed under `openclaw/plugin-sdk/<channel>`.
- **`webhook-targets.ts`** — types and registration for inbound webhook receivers.
- **`command-auth.ts`** — extension API for gating slash commands behind custom auth checks.

### `plugins`

**Path:** `src/plugins/`  
**Purpose:** Plugin lifecycle management: discovery, loading, and registration.

- **`loader.ts`** / **`module-loader.ts`** — resolves plugin packages from the filesystem using the configured plugin directories and loads them via dynamic import.
- **`install.ts`** / **`installs.ts`** — runs `npm install` in the plugin directory and validates the result.
- **`bundled-dir.ts`** — resolves the path of built-in bundled plugins.
- **`hooks.ts`** — plugin-contributed lifecycle hooks (loaded eagerly at boot).
- **`hooks-install.ts`** — hook registration during plugin install.
- **`hooks-status.ts`** — surfaces hook registration status for diagnostics.
- **`gmail*.ts`** — Gmail integration hooks (watch/unwatch, inbox listener, OAuth setup).
- **`workspace.ts`** — per-plugin workspace directory management.

### `hooks`

**Path:** `src/hooks/`  
**Purpose:** Internal publish/subscribe event bus for gateway lifecycle events.

- `registerHook` / `unregisterHook` / `triggerHook` — typed event emitter that decouples producers (gateway, agents, channels) from consumers (plugins, skills).
- Covers events such as `message:inbound`, `message:outbound`, `agent:start`, `agent:end`, `channel:connected`, `channel:disconnected`, and `gateway:shutdown`.

### `acp`

**Path:** `src/acp/`  
**Purpose:** Agent Capability Protocol (ACP) integration for multi-agent federation.

- **`client.ts`** — ACP client that connects to a remote ACP server and proxies agent calls.
- **`control-plane/`** — manages ACP binding lifecycles registered in `config/bindings.ts`.
- **`event-mapper.ts`** — translates between OpenClaw internal events and ACP wire-protocol messages.
- **`conversation-id.ts`** — stable conversation-ID derivation used by the ACP wire protocol.
- **`persistent-bindings.*.ts`** — stores ACP binding state across gateway restarts.

---

## Infrastructure

### `infra`

**Path:** `src/infra/`  
**Purpose:** Low-level utilities and OS-level helpers used throughout the codebase.

Notable sub-areas:

- **Environment** (`env.ts`, `dotenv.ts`) — loads `.env` files, normalises env-variable casing.
- **File system** (`archive.ts`, `archive-path.ts`, `archive-staging.ts`, `boundary-path.ts`, `boundary-file-read.ts`) — safe file reads with path-boundary enforcement, atomic archives.
- **Process** (`is-main.ts`, `openclaw-exec-env.ts`, `path-env.ts`, `warning-filter.ts`) — detects whether the current file is the main entry, manages `PATH`, filters Node experiment warnings.
- **Networking** (`ports.ts`, `bonjour.ts`, `bonjour-discovery.ts`) — port availability checks, mDNS service announcement/discovery.
- **Git** (`git-commit.ts`) — resolves the current commit hash from the dist bundle or `.git`.
- **Platform** (`brew.ts`, `binaries.ts`, `runtime-guard.ts`) — Homebrew integration, binary resolution, Node version check.
- **Errors** (`errors.ts`, `unhandled-rejections.ts`) — formats uncaught errors and installs a global rejection handler.
- **Home directory** (`home-dir.ts`) — resolves `~` and OpenClaw base dir across platforms.
- **Abort / backoff** (`abort-signal.ts`, `abort-pattern.ts`, `backoff.ts`) — shared abort-signal factories and exponential backoff helper.
- **Events** (`agent-events.ts`) — typed agent-lifecycle event emitter.

### `daemon`

**Path:** `src/daemon/`  
**Purpose:** System daemon (background service) management for keeping the gateway running.

- Supports **launchd** (macOS), **systemd** (Linux), and **Task Scheduler** (Windows via schtasks).
- **`launchd.ts`** / **`systemd.ts`** / **`schtasks.ts`** — install, uninstall, start, stop, and status operations.
- **`service.ts`** — cross-platform service façade.
- **`runtime-binary.ts`** — resolves the correct binary path for the service definition.
- **`runtime-hints.ts`** — suggests the right daemon command based on the detected runtime environment.
- **`service-audit.ts`** — validates that the installed service matches the running version.

### `process`

**Path:** `src/process/`  
**Purpose:** Child-process management and IPC utilities.

- **`exec.ts`** — `runExec` / `runCommandWithTimeout` — spawns shell commands and collects output with optional timeouts.
- **`child-process-bridge.ts`** — forwards signal handling (SIGINT/SIGTERM) from the parent to a child process.

### `node-host`

**Path:** `src/node-host/`  
**Purpose:** Node.js execution host for sandboxed agent tool calls.

- **`runner.ts`** — forks a sandboxed Node process and streams the execution result back to the agent.
- **`invoke.ts`** / **`invoke-browser.ts`** / **`invoke-system-run.ts`** — typed invocation helpers for code execution, browser automation, and shell commands.
- **`exec-policy.ts`** — checks the agent's exec policy before allowing a shell command.
- **`invoke-system-run-allowlist.ts`** — command allowlist for auto-approved shell executions.
- **`invoke-system-run-plan.ts`** — dry-run planning for shell invocations.

### `security`

**Path:** `src/security/`  
**Purpose:** Security policies, auditing, and input validation.

- **`audit.ts`** — audits the gateway configuration for insecure settings.
- **`audit-fs.ts`** — checks filesystem permissions on sensitive paths.
- **`audit-tool-policy.ts`** — validates that tool policies don't allow unintended access.
- **`dangerous-config-flags.ts`** / **`dangerous-tools.ts`** — allowlist of intentionally dangerous options that require explicit opt-in.
- **`dm-policy-*.ts`** — enforces DM-pairing requirements before the assistant responds.
- **`external-content.ts`** — sanitises external content before it is passed to the agent.
- **`scan-paths.ts`** — SSRF-safe URL and path validator.
- **`safe-regex.ts`** — timeout-safe regex execution to prevent ReDoS.
- **`skill-scanner.ts`** — scans installed skills for suspicious code patterns.
- **`temp-path-guard.ts`** — prevents tools from writing outside the temp directory.
- **`windows-acl.ts`** — applies restrictive Windows ACLs to config files.

### `secrets`

**Path:** `src/secrets/`  
**Purpose:** Encrypted secret storage and retrieval.

Provides a pluggable secrets backend (default: AES-256-GCM encrypted JSON file on disk; future: OS keychain). Exposes `readSecret`, `writeSecret`, `listSecrets`, and `auditSecrets`. Secrets are keyed by a namespaced identifier (`channel:provider:key`).

### `pairing`

**Path:** `src/pairing/`  
**Purpose:** Secure device / channel pairing via one-time codes.

- **`setup-code.ts`** — generates and validates ephemeral pairing codes.
- **`pairing-challenge.ts`** — implements the challenge–response pairing handshake.
- **`pairing-store.ts`** — persists approved pairings to disk.
- **`pairing-messages.ts`** — formats the pairing-prompt and confirmation messages shown to the user.
- **`pairing-labels.ts`** — human-readable labels for paired devices/channels.

### `cron`

**Path:** `src/cron/`  
**Purpose:** Scheduled task execution inside the gateway.

- **`delivery.ts`** — delivers a scheduled message to the agent or channel at the appointed time.
- **`heartbeat-policy.ts`** — rate-limits heartbeat deliveries to avoid flooding.
- **`isolated-agent/`** — runs a cron-triggered agent in an isolated session so it doesn't pollute the user's conversation history.

### `logging`

**Path:** `src/logging/`  
**Purpose:** Structured logging infrastructure.

- **`logger.ts`** — creates `winston`-backed logger instances with file and console transports.
- **`subsystem.ts`** — per-subsystem child loggers (keyed by `gateway`, `telegram`, `discord`, etc.).
- **`request-log.ts`** — logs inbound HTTP/WebSocket requests.
- **`ws-log.ts`** — WebSocket message logger.
- **`rotate.ts`** — daily log-file rotation.

---

## Media & UI

### `media`

**Path:** `src/media/`  
**Purpose:** Media file handling: image optimisation, audio transcoding, video extraction.

- **`audio.ts`** — audio format detection and base64 encoding for attachment payloads.
- **`fetch.ts`** — downloads remote media URLs with size guards.
- **`ffmpeg-exec.ts`** — thin wrapper around the `ffmpeg` binary for audio/video conversion.
- **`base64.ts`** — stream-to-base64 and file-to-base64 helpers.
- **`constants.ts`** — size caps and MIME-type lists.

### `browser`

**Path:** `src/browser/`  
**Purpose:** Chromium browser automation for the agent's web-browsing tool.

- **`cdp.ts`** — Chrome DevTools Protocol client: navigate, click, type, scroll, screenshot, execute JS.
- **`chrome.ts`** — locates/launches Chrome/Chromium, manages user-data directories and profiles.
- **`bridge-server.ts`** — exposes browser control over a local WebSocket so the agent can drive the browser from within a sandboxed runner.
- **`cdp-proxy-bypass.ts`** — bypasses corporate proxies for CDP connections.
- **`cdp-timeouts.ts`** — timeout configuration for CDP operations.

### `canvas-host`

**Path:** `src/canvas-host/`  
**Purpose:** Hosts the A2UI Canvas UI component inside the gateway.

- **`server.ts`** — local HTTP server that serves the bundled A2UI assets.
- **`a2ui.ts`** — entry point that starts the canvas server and advertises its URL.
- **`a2ui/`** — pre-bundled Canvas UI assets.
- **`file-resolver.ts`** — resolves asset paths from the bundle.

### `tts`

**Path:** `src/tts/`  
**Purpose:** Text-to-speech synthesis.

- **`tts-core.ts`** — synthesises speech using configured TTS providers (ElevenLabs, OpenAI TTS, Edge TTS, system `say`).
- **`tts.ts`** — resolves the active TTS configuration from the workspace config, merges directive overrides.
- **`prepare-text.ts`** — strips Markdown and code blocks from assistant replies before synthesis.

### `terminal`

**Path:** `src/terminal/`  
**Purpose:** Terminal output helpers.

- **`table.ts`** — ANSI-safe tabular output used by `status` commands.
- **`palette.ts`** — shared colour palette constants.
- **`progress-line.ts`** — single-line overwrite progress indicator.
- **`restore.ts`** — restores terminal state (cursor, alternate screen) on exit.
- **`wrap.ts`** — word-wraps text to the terminal width.

### `tui`

**Path:** `src/tui/`  
**Purpose:** Terminal User Interface for interactive sessions directly in the terminal.

Provides a real-time chat TUI powered by `@clack/prompts` and ANSI escape sequences. Handles multi-line input, streaming assistant output, and basic command shortcuts.

### `markdown`

**Path:** `src/markdown/`  
**Purpose:** Markdown processing utilities.

- Parses Markdown into an AST for downstream processing.
- Strips or converts Markdown to plain text for channels that don't support rich text.
- Formats code blocks and tables for terminal display.

### `wizard`

**Path:** `src/wizard/`  
**Purpose:** Interactive onboarding wizard (`openclaw onboard`).

Walks the user through gateway setup, channel configuration, model selection, and daemon installation using a series of `@clack/prompts` steps. Saves the resulting config file and optionally installs the system daemon.

---

## Shared Utilities

### `shared`

**Path:** `src/shared/`  
**Purpose:** Types and helpers shared between multiple modules with no external runtime dependencies.

- **`chat-content.ts`** / **`chat-message-content.ts`** / **`chat-envelope.ts`** — canonical types for message content across all channels.
- **`config-eval.ts`** — evaluates config expressions (e.g., template strings in config values).
- **`assistant-identity-values.ts`** — default assistant name and persona constants.
- **`avatar-policy.ts`** — rules for choosing the assistant's avatar image per channel.
- **`device-auth-store.ts`** — shared device-auth credential types.
- **`config-ui-hints-types.ts`** — types for UI-hint metadata embedded in config schemas.

### `types`

**Path:** `src/types/`  
**Purpose:** Ambient TypeScript type declarations for modules that lack their own type packages.

Contains `.d.ts` shims for native-module formats (e.g., `*.node` binaries) and global augmentations.

### `utils`

**Path:** `src/utils/`  
**Purpose:** General-purpose utility functions not specific to any domain.

Includes string manipulation, async helpers (`pLimit`-based concurrency), JSON/YAML parsing helpers, deep-merge, retry logic, and small functional utilities (`pick`, `omit`, `groupBy`).

### `i18n`

**Path:** `src/i18n/`  
**Purpose:** Internationalisation support.

Thin wrapper around a locale bundle that allows CLI output strings to be translated. Currently ships a single English locale; the framework is in place for additional languages.

### `compat`

**Path:** `src/compat/`  
**Purpose:** Compatibility shims for older config file formats and deprecated API paths.

Reads legacy config keys and rewrites them to the current canonical form at load time, ensuring smooth upgrades without breaking existing installations.
