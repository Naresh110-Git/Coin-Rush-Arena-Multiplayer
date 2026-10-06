import { InputManager } from './InputManager.js';
import { NetworkClient } from './NetworkClient.js';
import { QRCodeGenerator } from './qr.js';
import { Renderer } from './Renderer.js';
import { SoundManager } from './SoundManager.js';
import { GameEvent, GameStateSnapshot, PublicRoomInfo } from '../shared/types.js';

class App {
  private network: NetworkClient;
  private sound: SoundManager;
  private renderer: Renderer;
  private input: InputManager;

  // DOM Elements
  private screenLanding = document.getElementById('screen-landing')!;
  private screenLobby = document.getElementById('screen-lobby')!;
  private screenGameover = document.getElementById('screen-gameover')!;
  private gameHud = document.getElementById('game-hud')!;
  private countdownDisplay = document.getElementById('countdown-display')!;

  private inputNickname = document.getElementById('input-nickname') as HTMLInputElement;
  private inputRoomCode = document.getElementById('input-room-code') as HTMLInputElement;
  private lobbyRoomCode = document.getElementById('lobby-room-code')!;
  private lobbyQrCanvas = document.getElementById('lobby-qr-canvas') as HTMLCanvasElement;
  private lobbyPlayersList = document.getElementById('lobby-players-list')!;
  private roomsTableBody = document.getElementById('rooms-table-body')!;

  private btnCreateRoom = document.getElementById('btn-create-room')!;
  private btnSoloBots = document.getElementById('btn-solo-bots')!;
  private btnJoinRoom = document.getElementById('btn-join-room')!;
  private btnStartMatch = document.getElementById('btn-start-match')!;
  private btnAddBot = document.getElementById('btn-add-bot')!;
  private btnLeaveLobby = document.getElementById('btn-leave-lobby')!;
  private btnRematch = document.getElementById('btn-rematch')!;
  private btnBackLobby = document.getElementById('btn-back-lobby')!;
  private btnToggleSound = document.getElementById('btn-toggle-sound')!;

  private hudTimer = document.getElementById('hud-timer')!;
  private hudLeaderboard = document.getElementById('hud-leaderboard')!;
  private hudPing = document.getElementById('hud-ping')!;

  private gameoverWinnerTitle = document.getElementById('gameover-winner-title')!;
  private gameoverTiebreakNote = document.getElementById('gameover-tiebreak-note')!;
  private gameoverLeaderboard = document.getElementById('gameover-leaderboard')!;

  private currentStatus: string = 'WAITING';

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.sound = new SoundManager();
    this.network = new NetworkClient();

    this.input = new InputManager((dir) => {
      if (this.currentStatus === 'PLAYING') {
        this.network.sendMove(dir);
      }
    });

    this.setupNetworkCallbacks();
    this.bindEvents();
    this.startRenderLoop();
    this.checkAutoJoinFromUrl();
  }

  private setupNetworkCallbacks(): void {
    // 1. Authoritative State Updates
    this.network.onState((snapshot: GameStateSnapshot) => {
      this.renderer.updateSnapshot(snapshot);
      this.handleStateChange(snapshot);
    });

    // 2. Sound & Sensory Events
    this.network.onEvent((event: GameEvent) => {
      this.renderer.triggerEvent(event);

      switch (event.type) {
        case 'coin_collected':
          if (event.data?.coinType === 'golden') {
            this.sound.playGoldenCoin();
          } else {
            this.sound.playCoinPickup();
          }
          break;
        case 'countdown':
          this.sound.playCountdownPip(event.data?.count === 1);
          break;
        case 'rush_hour_start':
          this.sound.playRushHour();
          break;
        case 'match_started':
          this.sound.startMusic();
          break;
        case 'match_ended':
          this.sound.stopMusic();
          this.sound.playMatchEnd();
          break;
      }
    });

    // 3. Open Rooms Directory
    this.network.onPublicRooms((rooms: PublicRoomInfo[]) => {
      this.renderPublicRooms(rooms);
    });

    // 4. Ping Updates
    this.network.onPing((pingMs: number) => {
      const color = pingMs < 50 ? '#39ff14' : pingMs < 120 ? '#ffd700' : '#ff4500';
      this.hudPing.style.color = color;
      this.hudPing.textContent = `🟢 ${pingMs}ms`;
    });
  }

  private handleStateChange(snapshot: GameStateSnapshot): void {
    this.currentStatus = snapshot.status;

    // HUD Timer & Rush Hour styling
    this.hudTimer.textContent = String(snapshot.timeRemaining);
    if (snapshot.isRushHour) {
      this.hudTimer.classList.add('timer-rush');
    } else {
      this.hudTimer.classList.remove('timer-rush');
    }

    // In-Game Leaderboard
    const sortedPlayers = [...snapshot.players].sort((a, b) => b.score - a.score);
    this.hudLeaderboard.innerHTML = sortedPlayers
      .map(
        (p) =>
          `<div class="leaderboard-row" style="color:${p.color}">
             <span>${p.nickname}</span>
             <strong>${p.score}</strong>
           </div>`
      )
      .join('');

    // Screen visibility management
    if (snapshot.status === 'WAITING') {
      this.countdownDisplay.style.display = 'none';
      this.gameHud.style.display = 'none';
      this.screenLanding.style.display = 'none';
      this.screenGameover.style.display = 'none';
      this.screenLobby.style.display = 'flex';

      this.renderLobby(snapshot);
    } else if (snapshot.status === 'COUNTDOWN') {
      this.screenLanding.style.display = 'none';
      this.screenLobby.style.display = 'none';
      this.screenGameover.style.display = 'none';
      this.gameHud.style.display = 'flex';

      this.countdownDisplay.style.display = 'block';
      this.countdownDisplay.textContent = String(snapshot.countdownValue);
    } else if (snapshot.status === 'PLAYING') {
      this.countdownDisplay.style.display = 'none';
      this.screenLanding.style.display = 'none';
      this.screenLobby.style.display = 'none';
      this.screenGameover.style.display = 'none';
      this.gameHud.style.display = 'flex';
    } else if (snapshot.status === 'ENDED') {
      this.countdownDisplay.style.display = 'none';
      this.gameHud.style.display = 'none';
      this.screenLanding.style.display = 'none';
      this.screenLobby.style.display = 'none';
      this.screenGameover.style.display = 'flex';

      this.renderGameOver(snapshot);
    }
  }

  private renderLobby(snapshot: GameStateSnapshot): void {
    this.lobbyRoomCode.textContent = snapshot.roomCode;

    // Render QR Code for mobile scanning
    const inviteUrl = `${window.location.origin}?room=${snapshot.roomCode}`;
    QRCodeGenerator.renderToCanvas(this.lobbyQrCanvas, inviteUrl, 4);

    // Host controls visibility
    if (this.network.isHost) {
      this.btnStartMatch.style.display = 'block';
      this.btnAddBot.style.display = 'block';
    } else {
      this.btnStartMatch.style.display = 'none';
      this.btnAddBot.style.display = 'none';
    }

    // Players list
    this.lobbyPlayersList.innerHTML = snapshot.players
      .map(
        (p) =>
          `<div class="player-chip ${p.isHost ? 'is-host' : ''}" style="color:${p.color}">
             ${p.isHost ? '👑 ' : ''}${p.nickname} ${p.isBot ? '🤖' : ''}
           </div>`
      )
      .join('');
  }

  private renderGameOver(snapshot: GameStateSnapshot): void {
    const results = snapshot.results;
    if (!results) return;

    if (results.winner) {
      this.gameoverWinnerTitle.textContent = `👑 ${results.winner.nickname} WINS!`;
      this.gameoverWinnerTitle.style.color = results.winner.color;
    } else {
      this.gameoverWinnerTitle.textContent = 'MATCH DRAW!';
      this.gameoverWinnerTitle.style.color = '#ffd700';
    }

    if (results.tieBreakApplied) {
      this.gameoverTiebreakNote.style.display = 'block';
    } else {
      this.gameoverTiebreakNote.style.display = 'none';
    }

    this.gameoverLeaderboard.innerHTML = results.leaderboard
      .map(
        (p) =>
          `<div style="display:flex;justify-content:space-between;padding:0.6rem 1rem;background:rgba(6,7,19,0.5);border-radius:8px;margin-bottom:0.4rem;color:${p.color}">
             <span>#${p.rank} ${p.nickname} ${p.isBot ? '🤖' : ''}</span>
             <strong>${p.score} PTS</strong>
           </div>`
      )
      .join('');

    if (this.network.isHost) {
      this.btnRematch.style.display = 'inline-block';
    } else {
      this.btnRematch.style.display = 'none';
    }
  }

  private renderPublicRooms(rooms: PublicRoomInfo[]): void {
    if (!rooms || rooms.length === 0) {
      this.roomsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;color:#8892b0;padding:1.5rem;">
            No public rooms active right now. Create one above!
          </td>
        </tr>`;
      return;
    }

    this.roomsTableBody.innerHTML = rooms
      .map(
        (r) => `
        <tr>
          <td><strong style="font-family:'Orbitron', monospace;color:#ffd700;">${r.code}</strong></td>
          <td>${r.hostNickname}</td>
          <td>${r.playerCount}/${r.maxPlayers}</td>
          <td><span style="color:${r.status === 'WAITING' ? '#39ff14' : '#ff4500'};font-weight:700;">${r.status}</span></td>
          <td>
            <button class="btn-table-join" data-code="${r.code}">JOIN ROOM</button>
          </td>
        </tr>`
      )
      .join('');

    // Attach click listeners to 1-click Join buttons
    const buttons = this.roomsTableBody.querySelectorAll('.btn-table-join');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const code = (e.currentTarget as HTMLElement).getAttribute('data-code');
        if (code) {
          const nickname = this.inputNickname.value.trim() || 'Player';
          this.sound.unlockAudio();
          this.network.joinRoom(code, nickname, (res) => {
            if (!res.success) alert(res.error || 'Failed to join');
          });
        }
      });
    });
  }

  private bindEvents(): void {
    // 1. Create Room
    this.btnCreateRoom.addEventListener('click', () => {
      const nickname = this.inputNickname.value.trim() || 'Captain';
      this.sound.unlockAudio();
      this.network.createRoom(nickname, false, (res) => {
        if (!res.success) alert(res.error || 'Could not create room');
      });
    });

    // 2. Solo Practice Mode (vs AI Bots)
    this.btnSoloBots.addEventListener('click', () => {
      const nickname = this.inputNickname.value.trim() || 'SoloPilot';
      this.sound.unlockAudio();
      this.network.createRoom(nickname, true, (res) => {
        if (res.success) {
          // Immediately trigger countdown for instant play!
          setTimeout(() => {
            this.network.startGame();
          }, 300);
        } else {
          alert(res.error || 'Could not start practice mode');
        }
      });
    });

    // 3. Join with Code
    this.btnJoinRoom.addEventListener('click', () => {
      const code = this.inputRoomCode.value.trim().toUpperCase();
      const nickname = this.inputNickname.value.trim() || 'Player';
      if (!code) {
        alert('Please enter a 4-letter room code');
        return;
      }
      this.sound.unlockAudio();
      this.network.joinRoom(code, nickname, (res) => {
        if (!res.success) alert(res.error || 'Failed to join');
      });
    });

    // 4. Copy Room Code / Invite Link
    this.lobbyRoomCode.addEventListener('click', () => {
      const code = this.lobbyRoomCode.textContent || '';
      const url = `${window.location.origin}?room=${code}`;
      navigator.clipboard.writeText(url).then(() => {
        const original = this.lobbyRoomCode.textContent;
        this.lobbyRoomCode.textContent = 'COPIED!';
        setTimeout(() => {
          this.lobbyRoomCode.textContent = original;
        }, 1200);
      });
    });

    // 5. Add AI Bot
    this.btnAddBot.addEventListener('click', () => {
      this.network.addBot();
    });

    // 6. Start Match
    this.btnStartMatch.addEventListener('click', () => {
      this.sound.unlockAudio();
      this.network.startGame();
    });

    // 7. Leave Lobby
    this.btnLeaveLobby.addEventListener('click', () => {
      this.network.leaveRoom();
      window.location.href = window.location.pathname;
    });

    // 8. Rematch & Back to Lobby
    this.btnRematch.addEventListener('click', () => {
      this.network.requestRematch();
    });

    this.btnBackLobby.addEventListener('click', () => {
      this.network.leaveRoom();
      window.location.href = window.location.pathname;
    });

    // 9. Sound Mute Toggle
    this.btnToggleSound.addEventListener('click', () => {
      const isMuted = this.sound.toggleMute();
      this.btnToggleSound.textContent = isMuted ? '🔇' : '🔊';
    });
  }

  private checkAutoJoinFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    if (roomCode) {
      this.inputRoomCode.value = roomCode.toUpperCase();
    }
  }

  private startRenderLoop(): void {
    const loop = () => {
      this.renderer.render(this.network.playerId);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// Initialize on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
