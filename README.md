# Frontier Command

Frontier Command is a mobile-first real-time strategy game currently playable as a web app. It combines base building, resource gathering, tactical terrain, unit counters, veterancy, fog of war, adaptive AI, and private room-code multiplayer.

Play the current build: https://frontier-command.tylerberg45.chatgpt.site

## Project status

- Playable single-player skirmish
- Private online 1v1
- Touch, mouse, and keyboard controls
- Worker construction queues and repairs
- Tactical plateaus with two choke-point ramps
- Packable tracked Headquarters / Command Crawler
- Story campaign framework planned
- Unity 3D client planned after gameplay rules stabilize

## Repository layout

```text
app/                 Web client, simulation, UI, multiplayer, and API
game-content/        Engine-neutral versioned balance and campaign data
public/game-art/     Current 2D production sprites and terrain
docs/                Architecture, Unity migration, and content roadmap
tests/               Web build and rendered-output checks
scripts/             Build and Sites deployment helpers
```

Start with [Architecture](docs/ARCHITECTURE.md), [Unity migration](docs/UNITY_MIGRATION.md), and [Content roadmap](docs/CONTENT_ROADMAP.md).

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Validation:

```bash
npm run lint
npm test
```

## Content rule

New tunable stats and story definitions belong in `game-content/`, not inside renderer code. The web client and future Unity client should consume the same stable IDs and versioned data whenever possible.

## Hosting

The current web build is deployed through ChatGPT Sites. `.openai/hosting.json` preserves that deployment connection.
