# 🪙 Coin Rush Arena

> **Real-Time Multiplayer Arcade Arena Game**  
> Built for the **Handshake AI Skills Studio × OpenAI Multiplayer Game Challenge** (October 2026).

---

## ⚡ Overview
**Coin Rush Arena** is a real-time, zero-install 2D multiplayer arcade arena game for 2–6 players (with a Solo Practice mode vs. AI Bots).

Players maneuver glowing cyber-craft across a shared 800×500 grid to collect normal coins (+1 point) and golden stars (+3 points). In the final 15 seconds, **Rush Hour** activates with doubled golden coin spawn rates and an escalating synthwave soundtrack.

---

## 🚀 Key Highlights & Evaluation Criteria
1. **Server-Authoritative Networking:** All player movements, arena clamping, collision detection, coin spawning, and scoring are validated authoritatively on the Node.js server. Clients transmit movement vectors only.
2. **Frictionless Social Access:** No login, no accounts, no app downloads. Join via 4-letter room codes, an on-screen camera-scannable QR code, or the **Live Public Directory of Open Rooms** with 1-click joining.
3. **Solo Evaluator Mode:** Judges can test complete, full-speed gameplay immediately via **"Play Solo Practice (vs AI Bots)"** without requiring a second player or device.
4. **Resilient Session Recovery:** 30-second tokenized session resumption via `sessionStorage` ensures accidental browser tab refreshes preserve scores and active identities without creating ghost duplicate players.
5. **Deterministic Tie-Breaking:** If two players finish with identical scores, the server authoritatively awards the victory to whoever reached that tied score earliest.
6. **Zero External Media Assets:** Visuals are rendered via HTML5 Canvas 2D glow shaders, and sound effects + ambient synthwave soundtrack are synthesized procedurally in real-time via the Web Audio API.

---

## 🛠️ Tech Stack
* **Backend:** Node.js, Express, TypeScript, Socket.io
* **Frontend:** TypeScript, Vite, HTML5 Canvas 2D, Web Audio API, CSS3 Glassmorphism
* **Testing:** Vitest (unit testing, authoritative physics checks, and multi-client real-time simulation)
* **Deployment:** Render.com (via `render.yaml`)

---

## 🎮 Quick Start Guide

### Option 1: One-Click Launch (Windows)
Double-click **`START_GAME.bat`** in this folder! It launches the local server and opens your browser automatically at `http://localhost:3000`.

### Option 2: Command Line
```bash
# 1. Install dependencies
npm install

# 2. Build client and server
npm run build

# 3. Start local production server (Port 3000)
npm start

# 4. Open in browser
# http://localhost:3000
```

### Running Automated Tests
```bash
npm test
```

---

## 🌐 Free Cloud Deployment (Render.com)
1. Push this repository to GitHub.
2. In [Render.com](https://render.com), click **New +** $\rightarrow$ **Web Service**.
3. Select your repository. Render automatically detects [`render.yaml`](./render.yaml).
4. Click **Create Web Service**. Your live game URL will be online in ~2 minutes!

---

## 📄 Handshake Submission
See [`SUBMISSION_DETAILS.md`](./SUBMISSION_DETAILS.md) for the exact fields (Title, Description, Rubric Self-Audit) formatted to copy-paste into the Handshake challenge submission form.
