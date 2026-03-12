# 🎙️ swabble — Speech.framework wake-word hook daemon (macOS 26)

swabble is a Swift 6.2 wake-word hook daemon. The CLI targets macOS 26 (SpeechAnalyzer + SpeechTranscriber). The shared `SwabbleKit` target is multi-platform (iOS 17+ / macOS 15+) and exposes wake-word gating utilities for iOS/macOS apps.

- **Local-only**: Speech.framework on-device models; zero network usage.
- **Wake word**: Default `clawd` (aliases `claude`), optional `--no-wake` bypass.
- **SwabbleKit**: Shared wake gate utilities — gap-based segment-aware gating (`WakeWordGate.match`) plus `WakeWordSpeechSegments` helpers for `SFTranscription` integration.
- **Hooks**: Run any command with prefix/env, cooldown, min_chars, timeout.
- **Services**: `service install|uninstall` write/remove a real launchd plist at `~/Library/LaunchAgents/com.swabble.agent.plist` and print the matching `launchctl` command; `start|stop|restart` are foreground placeholders.
- **File transcribe**: TXT or SRT with time ranges (NLTokenizer sentence splits + AttributedString).

## Quick start
```bash
# Install deps
brew install swiftformat swiftlint

# Build
swift build

# Write default config (~/.config/swabble/config.json)
swift run swabble setup

# Run foreground daemon
swift run swabble serve

# Test your hook
swift run swabble test-hook "hello world"

# Transcribe a file to SRT
swift run swabble transcribe /path/to/audio.m4a --format srt --output out.srt
```

## Use as a library
Add swabble as a SwiftPM dependency and import the `Swabble` or `SwabbleKit` product:

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/steipete/swabble.git", branch: "main"),
],
targets: [
    .target(name: "MyApp", dependencies: [
        .product(name: "Swabble", package: "swabble"),     // Speech pipeline (macOS 26+ / iOS 26+)
        .product(name: "SwabbleKit", package: "swabble"),  // Wake-word gate utilities (iOS 17+ / macOS 15+)
    ]),
]
```

## CLI
- `serve` — foreground loop (mic → wake word match → strip wake → hook)
- `transcribe <file> [--locale <id>] [--format txt|srt] [--output <path>] [--censor] [--max-length <n>]` — offline transcription
- `test-hook "text"` — invoke configured hook (requires config)
- `mic list` — enumerate input devices
- `mic set <index>` — save device index to config
- `setup` — write default config JSON
- `doctor` — check Speech auth, config validity, and mic count
- `health` — prints `ok`
- `tail-log` — last 10 transcripts from the rolling store
- `status` — show wake enabled/word + last 3 transcripts
- `service install` — write `~/Library/LaunchAgents/com.swabble.agent.plist` and print `launchctl load -w` command
- `service uninstall` — remove plist and print `launchctl bootout` command
- `service status` — report whether the plist is installed
- `start|stop|restart` — placeholders (print instructions; full launchd wiring not yet implemented)

All commands accept Commander runtime flags (`-v/--verbose`, `--json-output`, `--log-level`), plus `--config` where applicable.

## Config
`~/.config/swabble/config.json` (auto-created by `setup`):
```json
{
  "audio": {"deviceName": "", "deviceIndex": -1, "sampleRate": 16000, "channels": 1},
  "wake": {"enabled": true, "word": "clawd", "aliases": ["claude"]},
  "hook": {
    "command": "",
    "args": [],
    "prefix": "Voice swabble from ${hostname}: ",
    "cooldownSeconds": 1,
    "minCharacters": 24,
    "timeoutSeconds": 5,
    "env": {}
  },
  "logging": {"level": "info", "format": "text"},
  "transcripts": {"enabled": true, "maxEntries": 50},
  "speech": {"localeIdentifier": "<system locale>", "etiquetteReplacements": false}
}
```

- Config path override: `--config /path/to/config.json` on relevant commands.
- `speech.localeIdentifier` defaults to `Locale.current.identifier` on the host machine.
- Transcripts persist to `~/Library/Application Support/swabble/transcripts.log` (rolling 100-entry window; `maxEntries` in config is currently unused by `TranscriptsStore`).

## Hook protocol
When a wake-gated transcript passes min_chars & cooldown, swabble runs:
```
<command> <args...> "<prefix><text>"
```
Environment variables:
- `SWABBLE_TEXT` — stripped transcript (wake word removed)
- `SWABBLE_PREFIX` — rendered prefix (hostname substituted)
- plus any `hook.env` key/values

## Speech pipeline
- `AVAudioEngine` tap → `BufferConverter` (sample-rate conversion via `AVAudioConverter`) → `AnalyzerInput` → `SpeechAnalyzer` with a `SpeechTranscriber` module.
- Requests volatile + final results; the `serve` command uses text-only wake matching (`WakeWordGate.matchesTextOnly` / `WakeWordGate.stripWake`).
- `SpeechPipeline` and `TranscribeCommand` both require macOS 26 / iOS 26 (`@available(macOS 26.0, iOS 26.0, *)`).
- Authorization requested at first start via `SFSpeechRecognizer.requestAuthorization`.

## Development
- Format: `./scripts/format.sh` (uses local `.swiftformat`)
- Lint: `./scripts/lint.sh` (uses local `.swiftlint.yml`)
- Tests: `swift test` (uses swift-testing package)

## Roadmap
- launchd control (load/bootout, PID + status socket)
- JSON logging + PII redaction toggle
- Stronger wake-word detection and control socket status/health
