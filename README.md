# CyberPurge

An Among Us-style real-time multiplayer browser game with a cybersecurity theme.
Players are **Antiviruses** (crewmates) or **Viruses** (impostors) inside a computer system.

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000 in multiple browser tabs to test multiplayer.

## How to Play

### Antivirus (Crewmate)
- Complete tasks: walk near a glowing gold station and press **E**
- Report dead bodies: press **R** near a body
- Call emergency meetings: click the **EMERGENCY** button (HUD top-right)
- **Win by:** completing all tasks OR ejecting all viruses

### Virus (Impostor)
- Kill nearby players: press **Q** (kill cooldown applies)
- Use vents to teleport: press **F** near a vent
- Sabotage systems: use buttons in the bottom HUD
- **Win by:** matching or outnumbering antiviruses alive

### Movement
- **WASD** or **Arrow Keys**

### Meetings & Voting
- During a meeting, type in the chat panel to discuss
- Click **VOTE** on a player you suspect, or **SKIP VOTE**
- After voting, the player with the most votes is ejected

## Tech Stack

- **Server:** Node.js + Express + Socket.IO
- **Client:** Phaser 3 (geometric MVP graphics) + plain HTML/CSS for UI

## Project Structure

```
cyberpurge/
├── server/
│   ├── index.js              # Express + Socket.IO server
│   ├── game/
│   │   ├── GameManager.js    # Active room registry
│   │   ├── GameRoom.js       # Per-room game logic
│   │   ├── Player.js         # Player class
│   │   ├── TaskManager.js    # Task assignment & tracking
│   │   └── VoteManager.js    # Voting logic
│   └── maps/
│       └── mainMap.json      # Map layout
└── client/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── main.js
        ├── scenes/           # Phaser scenes (Lobby, Game, MiniGame, Voting)
        ├── entities/         # PlayerSprite, TaskStation
        ├── network/          # SocketManager
        └── ui/               # HUD, ChatPanel
```

## Map Rooms

CPU Core · RAM Bank · Storage Drive · Network Hub · GPU Array ·
Firewall · BIOS Chamber · I/O Port · Cache Memory · Power Supply

## Tasks

| Task | Room | Type |
|------|------|------|
| Defragment Disk | Storage | Download (hold SPACE) |
| Patch Firewall | Firewall | Wires (match colors) |
| Clear Cache | Cache | Simon Says |
| Flush RAM | RAM | Calibration |
| Update BIOS | BIOS | Code Input |
| GPU Benchmark | GPU | Calibration |
| Network Scan | Network | Download |
| I/O Diagnostic | I/O Port | Wires |
| CPU Stress Test | CPU | Simon Says |
| Power Calibration | Power Supply | Code Input |
