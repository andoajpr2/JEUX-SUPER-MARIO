/* Moteur de jeu complet : physique, entités, rendu canvas procédural, HUD. */
import { AudioEngine } from "./audio";
import { LEVELS, THEMES, ROWS, TILE } from "./levels";
import type { Theme } from "./levels";

export type Phase = "title" | "card" | "playing" | "paused" | "gameover" | "victory";

export interface Stats {
  score: number;
  coins: number;
  lives: number;
  levelIdx: number;
  deaths: number;
  best: number;
}

const VW = 960;
const VH = 540;
const GRAV = 2300;
const MAXFALL = 1250;
const ACC = 2900;
const ICE_ACC = 950;
const FRI = 2500;
const ICE_FRI = 260;
const MAXRUN = 335;
const JUMPV = 940;
const COYOTE = 0.1;
const JBUF = 0.13;
const DASH_SPEED = 680;
const DASH_TIME = 0.2;
const DASH_CD = 0.85;

const SOLID = new Set(["X", "B", "?", "M", "S", "U", "T", "P"]);

interface Body { x: number; y: number; w: number; h: number; vx: number; vy: number; }
interface Enemy extends Body {
  kind: "g" | "f" | "s";
  dir: number;
  anchorY: number;
  ax: number;
  t: number;
  squash: number;
  dead: boolean;
}
interface Boss extends Body {
  hp: number;
  maxHp: number;
  state: "idle" | "air" | "slam" | "dying";
  t: number;
  inv: number;
  dir: number;
  onGround: boolean;
  dieT: number;
}
interface Platform {
  x: number; y: number; w: number; h: number;
  ax: number; ay: number; axis: "x" | "y"; range: number; speed: number; t: number; dx: number; dy: number;
}
interface Item extends Body { kind: "mush" | "star"; dir: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; grav: number; }
interface Float { x: number; y: number; txt: string; life: number; color: string; }
interface Bump { r: number; c: number; t: number; }
interface CoinEnt { x: number; y: number; taken: boolean; }
interface CheckEnt { x: number; y: number; taken: boolean; }
interface FlagEnt { x: number; topY: number; groundY: number; reached: boolean; }

function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export class Engine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  audio = new AudioEngine();
  onPhase: (p: Phase, s: Stats) => void;

  phase: Phase = "title";
  keys = new Set<string>();
  touch = { left: false, right: false, jump: false, dash: false };

  levelIdx = 0;
  theme: Theme = THEMES[0];
  grid: string[][] = [];
  W = 0;

  p: Body & {
    onGround: boolean; coyote: number; jbuf: number; face: number;
    powered: boolean; star: number; inv: number; dashT: number; dashCd: number;
    dead: boolean; deadT: number; animT: number; wasHeld: boolean;
  };
  checkpointPos = { x: 0, y: 0 };
  private checkpointDef: { level: number; x: number; y: number } | null = null;

  enemies: Enemy[] = [];
  boss: Boss | null = null;
  platforms: Platform[] = [];
  items: Item[] = [];
  coinsEnt: CoinEnt[] = [];
  checks: CheckEnt[] = [];
  flag: FlagEnt | null = null;
  particles: Particle[] = [];
  floats: Float[] = [];
  bumps: Bump[] = [];
  ambient: Particle[] = [];

  camX = 0; camY = 0; shake = 0;
  score = 0; coinCount = 0; lives = 3; timeLeft = 300;
  combo = 0; comboT = 0; deaths = 0;
  seq: { type: "flag" | "bossdie"; t: number } | null = null;
  titleCam = 0; titleDir = 1;
  tickTimer = 0;
  best = 0;

  private raf = 0;
  private last = 0;
  private hudFlash = 0;

  constructor(canvas: HTMLCanvasElement, onPhase: (p: Phase, s: Stats) => void) {
    this.canvas = canvas;
    canvas.width = VW;
    canvas.height = VH;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.onPhase = onPhase;
    this.p = this.freshPlayer();
    try { this.best = parseInt(localStorage.getItem("plombo_best") || "0", 10) || 0; } catch { this.best = 0; }
    this.setLevel(0, true);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.audio.stopMusic();
  }

  private freshPlayer() {
    return {
      x: 96, y: 400, w: 30, h: 42, vx: 0, vy: 0,
      onGround: false, coyote: 0, jbuf: 0, face: 1,
      powered: false, star: 0, inv: 0, dashT: 0, dashCd: 0,
      dead: false, deadT: 0, animT: 0, wasHeld: false,
    };
  }

  stats(): Stats {
    return { score: this.score, coins: this.coinCount, lives: this.lives, levelIdx: this.levelIdx, deaths: this.deaths, best: this.best };
  }

  private notify() { this.onPhase(this.phase, this.stats()); }

  /* ---------------- Contrôle ---------------- */
  private onKeyDown = (e: KeyboardEvent) => {
    const c = e.code;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(c)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(c);
    const p = this.p;
    if (c === "ArrowUp" || c === "KeyW" || c === "Space") p.jbuf = JBUF;
    if (c === "ShiftLeft" || c === "ShiftRight" || c === "KeyX" || c === "KeyL") this.tryDash();
    if (c === "KeyM") this.audio.toggleMute();
    if ((c === "Escape" || c === "KeyP") && (this.phase === "playing" || this.phase === "paused")) this.togglePause();
    if (c === "Enter" || c === "Space") {
      if (this.phase === "title" || this.phase === "gameover" || this.phase === "victory") this.startGame();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  setControl(k: "left" | "right" | "jump" | "dash", down: boolean) {
    this.touch[k] = down;
    if (down && k === "jump") this.p.jbuf = JBUF;
    if (down && k === "dash") this.tryDash();
  }

  private inputLeft() { return this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.touch.left; }
  private inputRight() { return this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.touch.right; }
  private inputJumpHeld() { return this.keys.has("ArrowUp") || this.keys.has("KeyW") || this.keys.has("Space") || this.touch.jump; }

  startGame() {
    this.audio.unlock();
    this.audio.select();
    this.score = 0; this.coinCount = 0; this.lives = 3; this.deaths = 0; this.combo = 0;
    this.checkpointDef = null;
    this.levelIdx = 0;
    this.setLevel(0, false);
    this.phase = "card";
    this.notify();
  }

  quitToTitle() {
    this.audio.stopMusic();
    this.checkpointDef = null;
    this.setLevel(0, true);
    this.phase = "title";
    this.notify();
  }

  beginPlay() {
    if (this.phase !== "card") return;
    this.phase = "playing";
    this.audio.startMusic(this.theme.music, this.theme.tempo);
    this.notify();
  }

  togglePause() {
    if (this.phase === "playing") {
      this.phase = "paused";
      this.audio.stopMusic();
      this.audio.select();
      this.notify();
    } else if (this.phase === "paused") {
      this.phase = "playing";
      this.audio.startMusic(this.theme.music, this.theme.tempo);
      this.notify();
    }
  }

  /* ---------------- Chargement de niveau ---------------- */
  tileAt(c: number, r: number): string {
    if (c < 0 || c >= this.W) return "X";
    if (r < 0 || r >= ROWS) return ".";
    return this.grid[r][c];
  }

  private setLevel(idx: number, silent: boolean) {
    this.levelIdx = idx;
    const def = LEVELS[idx];
    this.theme = THEMES[def.theme];
    this.grid = def.map.map((r) => r.split(""));
    this.W = this.grid[0].length;

    // Tuyaux : 'n' en haut à gauche → corps complet
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < this.W; c++) {
      if (this.grid[r][c] === "n") {
        this.grid[r][c] = "T";
        if (c + 1 < this.W) this.grid[r][c + 1] = "T";
        for (let rr = r + 1; rr < ROWS; rr++) {
          if (SOLID.has(this.grid[rr][c])) break;
          this.grid[rr][c] = "P";
          if (c + 1 < this.W) this.grid[rr][c + 1] = "P";
        }
      }
    }

    this.enemies = []; this.platforms = []; this.items = []; this.coinsEnt = [];
    this.checks = []; this.flag = null; this.boss = null;
    this.particles = []; this.floats = []; this.bumps = []; this.seq = null;

    for (let r = 0; r < ROWS; r++) for (let c = 0; c < this.W; c++) {
      const ch = this.grid[r][c];
      const x = c * TILE, y = r * TILE;
      if (ch === "o") { this.coinsEnt.push({ x: x + 12, y: y + 10, taken: false }); this.grid[r][c] = "."; }
      else if (ch === "g" || ch === "s") {
        this.enemies.push({ x: x + 7, y: (r + 1) * TILE - 34, w: 34, h: 34, vx: 0, vy: 0, kind: ch, dir: -1, anchorY: 0, ax: x, t: hash(c * 7 + r) * 3, squash: 0, dead: false });
        this.grid[r][c] = ".";
      } else if (ch === "f") {
        this.enemies.push({ x: x + 5, y: y + 8, w: 38, h: 32, vx: 0, vy: 0, kind: "f", dir: -1, anchorY: y + 8, ax: x, t: hash(c * 13 + r) * 6, squash: 0, dead: false });
        this.grid[r][c] = ".";
      } else if (ch === "K") {
        this.boss = { x: x - 28, y: (r + 1) * TILE - 96, w: 104, h: 96, vx: 0, vy: 0, hp: 5, maxHp: 5, state: "idle", t: 1, inv: 0, dir: -1, onGround: true, dieT: 0 };
        this.grid[r][c] = ".";
      } else if (ch === "m" || ch === "v") {
        this.platforms.push({ x, y, w: TILE * 3, h: 18, ax: x - TILE * 1.5, ay: y, axis: ch === "m" ? "x" : "y", range: ch === "m" ? TILE * 2.6 : TILE * 2.1, speed: ch === "m" ? 1.4 : 1.7, t: hash(c + r) * 6, dx: 0, dy: 0 });
        this.grid[r][c] = ".";
      } else if (ch === "C") {
        let gy = (ROWS - 1) * TILE;
        for (let rr = r + 1; rr < ROWS; rr++) if (SOLID.has(this.tileAt(c, rr))) { gy = rr * TILE; break; }
        this.checks.push({ x, y: gy - TILE * 3, taken: false });
        this.grid[r][c] = ".";
      } else if (ch === "F") {
        let gy = (ROWS - 1) * TILE;
        for (let rr = r + 1; rr < ROWS; rr++) if (SOLID.has(this.tileAt(c, rr))) { gy = rr * TILE; break; }
        this.flag = { x: x + TILE / 2 - 4, topY: y, groundY: gy, reached: false };
        this.grid[r][c] = ".";
      }
    }

    // Position de départ / checkpoint
    const startC = 2;
    let gy = (ROWS - 1) * TILE;
    for (let r = 0; r < ROWS; r++) if (SOLID.has(this.tileAt(startC, r))) { gy = r * TILE; break; }
    this.checkpointPos = { x: startC * TILE + 8, y: gy - this.p.h };
    if (this.checkpointDef && this.checkpointDef.level === idx) {
      this.checkpointPos = { x: this.checkpointDef.x, y: this.checkpointDef.y };
      for (const ck of this.checks) if (ck.x <= this.checkpointDef.x) ck.taken = true;
    }

    this.p = this.freshPlayer();
    this.p.x = this.checkpointPos.x;
    this.p.y = this.checkpointPos.y - 4;
    this.timeLeft = def.time;
    this.combo = 0; this.comboT = 0;
    this.camX = Math.max(0, this.p.x - VW / 3);
    this.camY = 0;
    this.ambient = [];
    if (!silent) this.audio.startMusic(this.theme.music, this.theme.tempo);
  }

  /* ---------------- Boucle ---------------- */
  private loop = (t: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.045, (t - this.last) / 1000 || 0.016);
    this.last = t;
    if (this.phase !== "paused") {
      if (this.phase === "title") this.updateTitle(dt);
      else if (this.phase === "card") this.updateWorldPassive(dt);
      else if (this.phase === "playing") this.updatePlaying(dt);
      else this.updateFx(dt);
    }
    this.draw();
  };

  private updateTitle(dt: number) {
    this.titleCam += this.titleDir * 46 * dt;
    const max = this.W * TILE - VW;
    if (this.titleCam > max) { this.titleCam = max; this.titleDir = -1; }
    if (this.titleCam < 0) { this.titleCam = 0; this.titleDir = 1; }
    this.camX = this.titleCam;
    this.camY = 0;
    this.updateCoinsAnim(dt);
    this.updateAmbient(dt);
    this.updateFx(dt);
  }

  private updateWorldPassive(dt: number) {
    this.updateCoinsAnim(dt);
    this.updateAmbient(dt);
    this.updateFx(dt);
    this.updateCamera(dt);
  }

  private updateCoinsAnim(dt: number) {
    for (const e of this.enemies) e.t += dt;
    for (const pl of this.platforms) {
      pl.t += dt * pl.speed;
      const nx = pl.axis === "x" ? pl.ax + Math.sin(pl.t) * pl.range : pl.ax;
      const ny = pl.axis === "y" ? pl.ay + Math.sin(pl.t) * pl.range : pl.ay;
      pl.dx = nx - pl.x; pl.dy = ny - pl.y; pl.x = nx; pl.y = ny;
    }
  }

  /* ---------------- Update principal ---------------- */
  private updatePlaying(dt: number) {
    const p = this.p;

    if (p.dead) {
      p.deadT += dt;
      p.vy = Math.min(p.vy + GRAV * dt, MAXFALL);
      p.y += p.vy * dt;
      if (p.deadT > 1.4) this.afterDeath();
      this.updateFx(dt);
      this.updateAmbient(dt);
      return;
    }

    if (this.seq) {
      this.updateSeq(dt);
      this.updateFx(dt);
      this.updateAmbient(dt);
      return;
    }

    // ---- Minuteur ----
    this.timeLeft -= dt;
    if (this.timeLeft <= 60) {
      this.tickTimer -= dt;
      if (this.tickTimer <= 0) { this.audio.tick(); this.tickTimer = 1; }
    }
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.killPlayer(); }

    // ---- Timers joueur ----
    if (p.inv > 0) p.inv -= dt;
    if (p.star > 0) p.star -= dt;
    if (p.dashT > 0) p.dashT -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.coyote > 0) p.coyote -= dt;
    if (p.jbuf > 0) p.jbuf -= dt;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (this.hudFlash > 0) this.hudFlash -= dt;

    // ---- Entrées ----
    const ice = !!this.theme.slippery;
    const acc = ice ? ICE_ACC : ACC;
    const fri = ice ? ICE_FRI : FRI;
    let move = 0;
    if (this.inputLeft()) move -= 1;
    if (this.inputRight()) move += 1;
    if (move !== 0) p.face = move;

    const maxSpd = p.dashT > 0 ? DASH_SPEED : MAXRUN;
    if (p.dashT > 0) {
      p.vx = p.face * DASH_SPEED;
    } else if (move !== 0) {
      p.vx += move * acc * dt;
      if (Math.abs(p.vx) > maxSpd) p.vx = Math.sign(p.vx) * maxSpd;
    } else {
      const s = Math.sign(p.vx);
      p.vx -= s * fri * dt;
      if (Math.sign(p.vx) !== s) p.vx = 0;
    }

    // Saut (buffer + coyote + hauteur variable)
    if (p.jbuf > 0 && (p.onGround || p.coyote > 0)) {
      p.vy = -JUMPV;
      p.onGround = false;
      p.coyote = 0;
      p.jbuf = 0;
      this.audio.jump(p.powered);
      this.burst(p.x + p.w / 2, p.y + p.h, 5, "#ffffff", 90, 0.25, 300);
    }
    const held = this.inputJumpHeld();
    if (!held && p.vy < -330) p.vy = -330;
    if (p.wasHeld !== held && held) p.wasHeld = true;
    p.wasHeld = held;

    p.vy = Math.min(p.vy + GRAV * dt, MAXFALL);

    // ---- Plateformes mobiles (avant le joueur) ----
    for (const pl of this.platforms) {
      pl.t += dt * pl.speed;
      const nx = pl.axis === "x" ? pl.ax + Math.sin(pl.t) * pl.range : pl.ax;
      const ny = pl.axis === "y" ? pl.ay + Math.sin(pl.t) * pl.range : pl.ay;
      pl.dx = nx - pl.x; pl.dy = ny - pl.y; pl.x = nx; pl.y = ny;
    }

    // ---- Déplacement & collisions tuiles ----
    const wasOnGround = p.onGround;
    this.moveBody(p, dt, true);
    if (wasOnGround && !p.onGround && p.vy >= 0) p.coyote = COYOTE;

    // Monter sur les plateformes (one-way)
    for (const pl of this.platforms) {
      const overlapX = p.x + p.w > pl.x + 4 && p.x < pl.x + pl.w - 4;
      const feet = p.y + p.h;
      if (overlapX && p.vy >= 0 && feet >= pl.y - 6 && feet <= pl.y + pl.h + 10) {
        p.y = pl.y - p.h;
        p.vy = 0;
        p.onGround = true;
        p.x += pl.dx;
        p.y += pl.dy;
      }
    }

    // ---- Piques / lave ----
    if (this.touchHazard()) this.damagePlayer();

    p.animT += Math.abs(p.vx) * dt;
    if (p.dashT > 0 && Math.random() < 0.6) {
      this.particles.push({ x: p.x + p.w / 2 - p.face * 10, y: p.y + 12 + Math.random() * 20, vx: -p.face * 120, vy: (Math.random() - 0.5) * 40, life: 0.22, max: 0.22, color: "#9fe0ff", size: 5, grav: 0 });
    }

    // ---- Pièces ----
    for (const c of this.coinsEnt) {
      if (c.taken) continue;
      if (p.x < c.x + 24 && p.x + p.w > c.x && p.y < c.y + 26 && p.y + p.h > c.y) {
        c.taken = true;
        this.collectCoin(c.x + 12, c.y + 12);
      }
    }

    // ---- Items ----
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.vy = Math.min(it.vy + GRAV * dt, MAXFALL);
      const prevIX = it.x;
      this.moveBody(it, dt, false);
      if (it.x === prevIX && it.vx !== 0) it.dir *= -1;
      it.vx = it.dir * (it.kind === "star" ? 110 : 70);
      if (it.kind === "star" && it.vy === 0) it.vy = -430;
      if (it.y > ROWS * TILE + 200) { this.items.splice(i, 1); continue; }
      if (p.x < it.x + it.w && p.x + p.w > it.x && p.y < it.y + it.h && p.y + p.h > it.y) {
        this.items.splice(i, 1);
        if (it.kind === "mush") {
          p.powered = true;
          this.score += 1000;
          this.audio.powerup();
          this.float(p.x, p.y - 20, "+1000", "#ff8ac2");
          this.burst(p.x + p.w / 2, p.y, 12, "#ff8ac2", 160, 0.5, 500);
        } else {
          p.star = 8;
          this.score += 1000;
          this.audio.star();
          this.float(p.x, p.y - 20, "ÉTOILE!", "#ffd23f");
          this.burst(p.x + p.w / 2, p.y, 16, "#ffd23f", 200, 0.6, 400);
        }
        this.hudFlash = 0.2;
      }
    }

    // ---- Ennemis ----
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.enemies = this.enemies.filter((e) => !(e.dead && e.squash <= 0));
    for (const e of this.enemies) this.enemyVsPlayer(e);

    // ---- Boss ----
    if (this.boss) this.updateBoss(dt);

    // ---- Checkpoints ----
    for (const ck of this.checks) {
      if (ck.taken) continue;
      if (p.x + p.w > ck.x + 8 && p.x < ck.x + TILE - 8 && p.y + p.h > ck.y && p.y < ck.y + TILE * 3) {
        ck.taken = true;
        this.checkpointPos = { x: ck.x + 9, y: ck.y + TILE * 3 - p.h };
        this.checkpointDef = { level: this.levelIdx, x: this.checkpointPos.x, y: this.checkpointPos.y };
        this.score += 500;
        this.audio.checkpoint();
        this.float(ck.x, ck.y - 10, "CHECKPOINT +500", "#46e6e0");
        this.burst(ck.x + 24, ck.y + 10, 14, "#46e6e0", 180, 0.6, 400);
      }
    }

    // ---- Drapeau ----
    if (this.flag && !this.flag.reached && p.x + p.w > this.flag.x - 6 && p.x < this.flag.x + 20) {
      this.flag.reached = true;
      const bonus = Math.max(0, Math.ceil(this.timeLeft)) * 10;
      this.score += bonus;
      this.float(this.flag.x - 30, this.flag.topY + 60, `TEMPS +${bonus}`, "#ffd23f");
      this.seq = { type: "flag", t: 0 };
      this.audio.flag();
    }

    // ---- Chute dans le vide ----
    if (p.y > ROWS * TILE + 60) this.killPlayer(true);

    this.updateAmbient(dt);
    this.updateFx(dt);
    this.updateCamera(dt);
  }

  private updateSeq(dt: number) {
    const s = this.seq!;
    s.t += dt;
    const p = this.p;
    if (s.type === "flag") {
      const f = this.flag!;
      if (s.t < 1.0) {
        p.x = f.x - p.w + 12;
        p.vx = 0;
        p.vy = 300;
        p.y = Math.min(p.y + p.vy * dt, f.groundY - p.h);
      } else if (s.t < 2.0) {
        p.face = 1;
        p.vx = 150;
        p.vy = Math.min(p.vy + GRAV * dt, MAXFALL);
        this.moveBody(p, dt, false);
        p.animT += 10 * dt;
      }
      if (Math.floor(s.t * 4) !== Math.floor((s.t - dt) * 4)) {
        const fx = f.x + (Math.random() - 0.5) * 300;
        const fy = f.topY - 40 - Math.random() * 120;
        const cols = ["#ffd23f", "#ff5d5d", "#46e6e0", "#ff8ac2", "#ffffff"];
        this.burst(fx, fy, 16, cols[Math.floor(Math.random() * cols.length)], 220, 0.7, 300);
      }
      if (s.t > 2.5) {
        this.seq = null;
        if (this.levelIdx >= LEVELS.length - 1) this.win();
        else {
          this.setLevel(this.levelIdx + 1, false);
          this.phase = "card";
          this.notify();
        }
      }
    } else {
      // bossdie : explosions en chaîne
      const b = this.boss!;
      b.dieT += dt;
      if (Math.floor(s.t * 8) !== Math.floor((s.t - dt) * 8)) {
        this.burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, 14, ["#ffd23f", "#ff5d5d", "#ffffff"][Math.floor(Math.random() * 3)], 260, 0.7, 200);
        this.shake = Math.max(this.shake, 9);
        this.audio.kick();
      }
      if (s.t > 1.8) { this.seq = null; this.win(); }
    }
  }

  private updateCamera(dt: number) {
    const p = this.p;
    const tx = Math.max(0, Math.min(p.x + p.face * 80 - VW / 2 + p.w / 2, this.W * TILE - VW));
    this.camX += (tx - this.camX) * Math.min(1, 8 * dt);
    const maxCy = ROWS * TILE - VH;
    const ty = Math.max(0, Math.min(p.y - VH * 0.55, maxCy));
    this.camY += (ty - this.camY) * Math.min(1, 8 * dt);
  }

  /* ---------------- Corps & collisions ---------------- */
  private moveBody(b: Body, dt: number, isPlayer: boolean) {
    // X
    b.x += b.vx * dt;
    {
      const r0 = Math.floor(b.y / TILE), r1 = Math.floor((b.y + b.h - 1) / TILE);
      if (b.vx > 0) {
        const c = Math.floor((b.x + b.w) / TILE);
        for (let r = r0; r <= r1; r++) if (SOLID.has(this.tileAt(c, r))) {
          b.x = c * TILE - b.w - 0.01;
          if (isPlayer) b.vx = 0;
          break;
        }
      } else if (b.vx < 0) {
        const c = Math.floor(b.x / TILE);
        for (let r = r0; r <= r1; r++) if (SOLID.has(this.tileAt(c, r))) {
          b.x = (c + 1) * TILE + 0.01;
          if (isPlayer) b.vx = 0;
          break;
        }
      }
    }
    // Y
    b.y += b.vy * dt;
    const c0 = Math.floor(b.x / TILE), c1 = Math.floor((b.x + b.w - 1) / TILE);
    (b as { onGround?: boolean }).onGround = false;
    if (b.vy > 0) {
      const r = Math.floor((b.y + b.h) / TILE);
      for (let c = c0; c <= c1; c++) if (SOLID.has(this.tileAt(c, r))) {
        b.y = r * TILE - b.h;
        b.vy = 0;
        (b as { onGround?: boolean }).onGround = true;
        break;
      }
    } else if (b.vy < 0) {
      const r = Math.floor(b.y / TILE);
      let hitC = -1;
      let prio = "";
      for (let c = c0; c <= c1; c++) {
        const ch = this.tileAt(c, r);
        if (SOLID.has(ch)) {
          const pr = ch === "?" || ch === "M" || ch === "S" ? 3 : ch === "B" ? 2 : 1;
          const pp = prio === "?" || prio === "M" || prio === "S" ? 3 : prio === "B" ? 2 : prio === "" ? 0 : 1;
          if (pr > pp) { prio = ch; hitC = c; }
        }
      }
      if (hitC >= 0) {
        b.y = (r + 1) * TILE + 0.01;
        b.vy = 0;
        if (isPlayer) this.blockHit(r, hitC);
      }
    }
  }

  private touchHazard(): boolean {
    const p = this.p;
    const c0 = Math.floor((p.x + 5) / TILE), c1 = Math.floor((p.x + p.w - 5) / TILE);
    const r0 = Math.floor((p.y + 8) / TILE), r1 = Math.floor((p.y + p.h - 2) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (this.tileAt(c, r) === "^") return true;
    }
    return false;
  }

  private blockHit(r: number, c: number) {
    const ch = this.grid[r][c];
    const bx = c * TILE, by = r * TILE;
    if (ch === "B") {
      if (this.p.powered) {
        this.grid[r][c] = ".";
        this.score += 50;
        this.audio.brick();
        this.shake = Math.max(this.shake, 4);
        for (let i = 0; i < 6; i++) {
          this.particles.push({ x: bx + 24, y: by + 24, vx: (Math.random() - 0.5) * 380, vy: -Math.random() * 420 - 80, life: 0.7, max: 0.7, color: i % 2 ? this.theme.brick : this.theme.brickDark, size: 9, grav: 1400 });
        }
      } else {
        this.bumps.push({ r, c, t: 0 });
        this.audio.bump();
      }
    } else if (ch === "?" || ch === "M" || ch === "S") {
      this.grid[r][c] = "U";
      this.bumps.push({ r, c, t: 0 });
      if (ch === "?") {
        this.collectCoin(bx + 24, by - 14, true);
      } else if (ch === "M") {
        this.items.push({ x: bx + 6, y: by - 36, w: 36, h: 36, vx: 70, vy: -160, kind: "mush", dir: 1 });
        this.audio.bump();
      } else {
        this.items.push({ x: bx + 6, y: by - 36, w: 36, h: 36, vx: 110, vy: -260, kind: "star", dir: 1 });
        this.audio.bump();
      }
    } else {
      this.audio.bump();
    }
  }

  private collectCoin(x: number, y: number, pop = false) {
    this.coinCount++;
    this.score += 100;
    this.audio.coin();
    this.hudFlash = 0.15;
    this.burst(x, y, pop ? 8 : 5, "#ffd23f", 130, 0.35, 250);
    if (pop) this.float(x - 20, y - 14, "+100", "#ffd23f");
    if (this.coinCount % 100 === 0) {
      this.lives++;
      this.audio.oneUp();
      this.float(this.p.x - 10, this.p.y - 30, "1UP!", "#7ae08a");
    }
  }

  private tryDash() {
    const p = this.p;
    if (this.phase !== "playing" || p.dead || this.seq) return;
    if (p.dashCd > 0) return;
    p.dashT = DASH_TIME;
    p.dashCd = DASH_CD;
    p.vx = p.face * DASH_SPEED;
    this.audio.dash();
    this.burst(p.x + p.w / 2, p.y + p.h / 2, 8, "#9fe0ff", 180, 0.3, 100);
  }

  /* ---------------- Ennemis ---------------- */
  private updateEnemy(e: Enemy, dt: number) {
    if (e.dead) { e.squash -= dt; return; }
    e.t += dt;
    if (e.kind === "f") {
      e.y = e.anchorY + Math.sin(e.t * 2.4) * 34;
      e.x += e.dir * 55 * dt;
      const c = Math.floor((e.x + (e.dir > 0 ? e.w + 6 : -6)) / TILE);
      const r = Math.floor((e.y + e.h / 2) / TILE);
      if (SOLID.has(this.tileAt(c, r)) || e.x < e.ax - 150 || e.x > e.ax + 150) e.dir *= -1;
    } else {
      const spd = e.kind === "s" ? 46 : 62;
      e.vx = e.dir * spd;
      e.vy = Math.min(e.vy + GRAV * dt, MAXFALL);
      const prevX = e.x;
      this.moveBody(e, dt, false);
      if (e.x === prevX && e.vx !== 0) e.dir *= -1; // mur
      if ((e as { onGround?: boolean }).onGround) {
        const aheadC = Math.floor((e.x + (e.dir > 0 ? e.w + 4 : -4)) / TILE);
        const belowR = Math.floor((e.y + e.h + 8) / TILE);
        if (!SOLID.has(this.tileAt(aheadC, belowR))) e.dir *= -1;
      }
      if (e.y > ROWS * TILE + 200) e.dead = true;
    }
  }

  private enemyVsPlayer(e: Enemy) {
    const p = this.p;
    if (e.dead || p.dead) return;
    if (!(p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y)) return;
    const powerful = p.star > 0 || p.dashT > 0;
    const stompable = e.kind !== "s";
    const falling = p.vy > 120;
    const fromAbove = p.y + p.h - p.vy * 0.016 <= e.y + 16;
    if (powerful) {
      this.killEnemy(e, true);
      return;
    }
    if (falling && fromAbove && stompable) {
      this.killEnemy(e, false);
      this.combo++;
      this.comboT = 1.5;
      const gain = 100 * this.combo;
      this.score += gain;
      this.float(e.x, e.y - 16, this.combo > 1 ? `×${this.combo} +${gain}` : `+${gain}`, this.combo > 2 ? "#ff8ac2" : "#ffffff");
      p.vy = this.inputJumpHeld() ? -760 : -560;
      p.y = e.y - p.h - 1;
    } else {
      this.damagePlayer();
    }
  }

  private killEnemy(e: Enemy, kicked: boolean) {
    e.dead = true;
    e.squash = 0.4;
    this.score += kicked ? 150 : 0;
    if (kicked) this.float(e.x, e.y - 10, "+150", "#9fe0ff");
    this.audio.stomp(this.combo + 1);
    this.shake = Math.max(this.shake, 3);
    this.burst(e.x + e.w / 2, e.y + e.h / 2, 8, e.kind === "s" ? "#ffd23f" : "#c9502c", 170, 0.4, 500);
  }

  /* ---------------- Boss ---------------- */
  private updateBoss(dt: number) {
    const b = this.boss!;
    const p = this.p;
    if (b.state === "dying") return;
    if (b.inv > 0) b.inv -= dt;
    b.t -= dt;
    b.vy = Math.min(b.vy + GRAV * dt, MAXFALL);
    const prevY = b.y;
    this.moveBody(b, dt, false);
    b.onGround = !!(b as { onGround?: boolean }).onGround;

    if (b.onGround) {
      b.vx *= 0.8;
      if (b.state === "air" || b.state === "slam") {
        if (b.state === "slam") {
          this.shake = Math.max(this.shake, 16);
          this.audio.bossHit();
          const cx = b.x + b.w / 2;
          for (let i = 0; i < 18; i++) {
            this.particles.push({ x: cx + (Math.random() - 0.5) * b.w, y: b.y + b.h, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 320, life: 0.6, max: 0.6, color: i % 2 ? "#ff9d2e" : "#8b8ba6", size: 8, grav: 1200 });
          }
          // Onde de choc : blesse le joueur au sol proche
          if (p.onGround && Math.abs(p.x + p.w / 2 - cx) < 200 && b.y + b.h - prevY > 4) this.damagePlayer();
        } else {
          this.burst(b.x + b.w / 2, b.y + b.h, 6, "#8b8ba6", 120, 0.3, 300);
        }
        b.state = "idle";
        b.t = 0.7 + Math.random() * 0.5;
      } else if (b.t <= 0) {
        b.dir = Math.sign(p.x - b.x) || -1;
        if (Math.random() < 0.35) {
          b.vy = -760;
          b.vx = b.dir * 60;
          b.state = "slam";
        } else {
          b.vy = -560;
          b.vx = b.dir * (150 + Math.random() * 80);
          b.state = "air";
        }
        b.onGround = false;
      }
    }

    // Contact joueur
    if (!p.dead && p.x < b.x + b.w && p.x + p.w > b.x && p.y < b.y + b.h && p.y + p.h > b.y) {
      const falling = p.vy > 120;
      const fromAbove = p.y + p.h - p.vy * 0.016 <= b.y + 20;
      if (falling && fromAbove && b.inv <= 0 && b.state !== "slam") {
        b.hp--;
        b.inv = 1.2;
        p.vy = -680;
        p.y = b.y - p.h - 1;
        this.shake = Math.max(this.shake, 10);
        this.audio.bossHit();
        this.float(b.x + b.w / 2 - 20, b.y - 20, b.hp > 0 ? `COUP! ${b.hp} RESTANT${b.hp > 1 ? "S" : ""}` : "K.O.!", "#ffd23f");
        this.burst(b.x + b.w / 2, b.y + 20, 14, "#ffd23f", 240, 0.5, 400);
        if (b.hp === 4 || b.hp === 2) {
          for (let i = 0; i < 2; i++) {
            const gx = Math.max(TILE, Math.min(b.x + (i === 0 ? -140 : b.w + 100), (this.W - 3) * TILE));
            this.enemies.push({ x: gx, y: b.y, w: 34, h: 34, vx: 0, vy: 0, kind: "g", dir: i === 0 ? 1 : -1, anchorY: 0, ax: gx, t: 0, squash: 0, dead: false });
          }
        }
        if (b.hp <= 0) {
          b.state = "dying";
          this.score += 5000;
          this.seq = { type: "bossdie", t: 0 };
          this.audio.bossDie();
          this.audio.stopMusic();
        }
      } else if (p.star > 0) {
        // L'étoile ne blesse pas le boss, mais protège
      } else if (p.dashT <= 0) {
        this.damagePlayer();
      }
    }
  }

  /* ---------------- Dégâts / mort ---------------- */
  private damagePlayer() {
    const p = this.p;
    if (p.inv > 0 || p.star > 0 || p.dashT > 0 || p.dead) return;
    if (p.powered) {
      p.powered = false;
      p.inv = 2;
      this.audio.hurt();
      this.shake = Math.max(this.shake, 8);
      this.burst(p.x + p.w / 2, p.y + p.h / 2, 10, "#ff5d5d", 180, 0.4, 400);
    } else {
      this.killPlayer();
    }
  }

  private killPlayer(fell = false) {
    const p = this.p;
    if (p.dead) return;
    p.dead = true;
    p.deadT = 0;
    p.star = 0;
    p.vy = fell ? -260 : -640;
    p.vx = 0;
    this.deaths++;
    this.audio.death();
    this.shake = Math.max(this.shake, 10);
  }

  private afterDeath() {
    this.lives--;
    if (this.lives <= 0) {
      this.phase = "gameover";
      this.saveBest();
      this.audio.stopMusic();
      this.notify();
      return;
    }
    this.setLevel(this.levelIdx, false);
    this.phase = "card";
    this.notify();
  }

  private win() {
    this.phase = "victory";
    this.saveBest();
    this.audio.stopMusic();
    this.notify();
  }

  private saveBest() {
    if (this.score > this.best) {
      this.best = this.score;
      try { localStorage.setItem("plombo_best", String(this.best)); } catch { /* ignore */ }
    }
  }

  /* ---------------- FX ---------------- */
  private burst(x: number, y: number, n: number, color: string, spd: number, life: number, grav: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = spd * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.3, life, max: life, color, size: 3 + Math.random() * 5, grav });
    }
  }

  private float(x: number, y: number, txt: string, color: string) {
    this.floats.push({ x, y, txt, life: 1.1, color });
  }

  private updateFx(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
      pt.vy += pt.grav * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    if (this.particles.length > 320) this.particles.splice(0, this.particles.length - 320);
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.y -= 46 * dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    for (let i = this.bumps.length - 1; i >= 0; i--) {
      this.bumps[i].t += dt;
      if (this.bumps[i].t > 0.2) this.bumps.splice(i, 1);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 34 * dt);
  }

  private updateAmbient(dt: number) {
    const th = this.theme;
    if (th.ambient !== "none" && this.ambient.length < 42 && Math.random() < 0.3) {
      const x = this.camX + Math.random() * VW;
      if (th.ambient === "snow") this.ambient.push({ x, y: this.camY - 10, vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 70, life: 9, max: 9, color: "#ffffff", size: 3 + Math.random() * 3, grav: 0 });
      else if (th.ambient === "embers") this.ambient.push({ x, y: this.camY + VH + 10, vx: (Math.random() - 0.5) * 30, vy: -70 - Math.random() * 90, life: 7, max: 7, color: Math.random() < 0.5 ? "#ff9d2e" : "#ff5d2e", size: 3 + Math.random() * 3, grav: 0 });
      else if (th.ambient === "firefly") this.ambient.push({ x, y: this.camY + Math.random() * VH, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 40, life: 6, max: 6, color: "#ffd23f", size: 3, grav: 0 });
      else this.ambient.push({ x, y: this.camY + Math.random() * VH * 0.7, vx: -12 + Math.random() * 24, vy: 8 + Math.random() * 16, life: 8, max: 8, color: "#ffffff", size: 2 + Math.random() * 2, grav: 0 });
    }
    for (let i = this.ambient.length - 1; i >= 0; i--) {
      const a = this.ambient[i];
      a.life -= dt;
      if (a.life <= 0 || a.y > this.camY + VH + 30 || a.y < this.camY - 40) { this.ambient.splice(i, 1); continue; }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (th.ambient === "firefly") { a.vx += (Math.random() - 0.5) * 200 * dt; a.vy += (Math.random() - 0.5) * 160 * dt; }
    }
  }

  /* =============================================================
     RENDU
     ============================================================= */
  private draw() {
    const g = this.ctx;
    const th = this.theme;
    const shx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    g.save();

    // Ciel
    const sky = g.createLinearGradient(0, 0, 0, VH);
    sky.addColorStop(0, th.skyTop);
    sky.addColorStop(1, th.skyBot);
    g.fillStyle = sky;
    g.fillRect(0, 0, VW, VH);

    this.drawParallax(g);

    g.translate(-Math.floor(this.camX + shx), -Math.floor(this.camY + shy));

    // Ambiance derrière le monde
    for (const a of this.ambient) {
      g.globalAlpha = Math.min(1, a.life / 2) * 0.8;
      g.fillStyle = a.color;
      g.fillRect(a.x, a.y, a.size, a.size);
    }
    g.globalAlpha = 1;

    this.drawTiles(g);
    this.drawChecks(g);
    this.drawFlag(g);
    this.drawPlatforms(g);
    this.drawCoins(g);
    this.drawItems(g);
    for (const e of this.enemies) this.drawEnemy(g, e);
    if (this.boss && this.boss.state !== "dying") this.drawBoss(g, this.boss);
    if (this.phase !== "title") this.drawPlayer(g);

    // Particules
    for (const pt of this.particles) {
      g.globalAlpha = Math.max(0, pt.life / pt.max);
      g.fillStyle = pt.color;
      g.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    g.globalAlpha = 1;

    // Textes flottants
    g.font = '12px "Press Start 2P", monospace';
    g.textAlign = "center";
    for (const f of this.floats) {
      g.globalAlpha = Math.min(1, f.life * 2);
      g.fillStyle = "#0b0e1f";
      g.fillText(f.txt, f.x + 2, f.y + 2);
      g.fillStyle = f.color;
      g.fillText(f.txt, f.x, f.y);
    }
    g.globalAlpha = 1;

    g.restore();

    if (this.phase !== "title") this.drawHUD(g);
  }

  private drawParallax(g: CanvasRenderingContext2D) {
    const th = this.theme;
    const t = performance.now() / 1000;
    // couche lointaine
    g.fillStyle = th.far;
    const f1 = 0.18;
    for (let i = -1; i < 8; i++) {
      const bx = i * 240 - ((this.camX * f1) % 240);
      const bh = 90 + hash(i + Math.floor((this.camX * f1) / 240)) * 110;
      if (th.ambient === "stars" || th.ambient === "none") {
        g.fillRect(bx, VH - bh - 40 + this.camY * 0.1, 180, bh + 80);
      } else {
        g.beginPath();
        g.arc(bx + 90, VH - 20 + this.camY * 0.1, bh, Math.PI, 0);
        g.fill();
      }
    }
    // étoiles scintillantes pour les thèmes sombres
    if (th.ambient === "stars" || th.ambient === "embers") {
      g.fillStyle = "#ffffff";
      for (let i = 0; i < 46; i++) {
        const sx = (hash(i * 3.7) * VW * 1.6 - this.camX * 0.06) % (VW + 40);
        const sy = hash(i * 9.1) * VH * 0.7;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i));
        g.globalAlpha = tw * 0.9;
        g.fillRect(sx < 0 ? sx + VW + 40 : sx, sy, 3, 3);
      }
      g.globalAlpha = 1;
    }
    // couche proche
    g.fillStyle = th.near;
    const f2 = 0.42;
    for (let i = -1; i < 7; i++) {
      const bx = i * 320 - ((this.camX * f2) % 320);
      const bh = 60 + hash(i * 5.3 + 40 + Math.floor((this.camX * f2) / 320)) * 90;
      if (th.ambient === "clouds") {
        const cy = 70 + hash(i * 7.7) * 200;
        g.globalAlpha = 0.85;
        g.beginPath();
        g.arc(bx + 60, cy, 26, 0, 7);
        g.arc(bx + 96, cy - 12, 32, 0, 7);
        g.arc(bx + 134, cy, 24, 0, 7);
        g.fill();
        g.globalAlpha = 1;
      } else {
        g.fillRect(bx, VH - bh + this.camY * 0.2, 260, bh + 40);
      }
    }
  }

  private drawTiles(g: CanvasRenderingContext2D) {
    const th = this.theme;
    const c0 = Math.max(0, Math.floor(this.camX / TILE) - 1);
    const c1 = Math.min(this.W - 1, Math.floor((this.camX + VW) / TILE) + 1);
    for (let r = 0; r < ROWS; r++) for (let c = c0; c <= c1; c++) {
      const ch = this.grid[r][c];
      if (ch === ".") continue;
      let yOff = 0;
      for (const b of this.bumps) if (b.r === r && b.c === c) yOff = -Math.sin(Math.min(1, b.t / 0.2) * Math.PI) * 9;
      const x = c * TILE, y = r * TILE + yOff;
      if (ch === "X") {
        const above = this.tileAt(c, r - 1);
        g.fillStyle = th.groundBody;
        g.fillRect(x, y, TILE, TILE);
        if (!SOLID.has(above)) {
          g.fillStyle = th.groundTop;
          g.fillRect(x, y, TILE, 12);
          g.fillStyle = "rgba(255,255,255,0.25)";
          g.fillRect(x, y, TILE, 4);
        }
        g.fillStyle = "rgba(0,0,0,0.16)";
        if ((c + r) % 2 === 0) g.fillRect(x + 8, y + 24, 6, 6);
        else g.fillRect(x + 30, y + 34, 6, 6);
      } else if (ch === "B") {
        g.fillStyle = th.brick;
        g.fillRect(x, y, TILE, TILE);
        g.fillStyle = th.brickDark;
        g.fillRect(x, y + 22, TILE, 4);
        g.fillRect(x + 22, y, 4, 22);
        g.fillRect(x + 10, y + 26, 4, 22);
        g.fillRect(x + 34, y + 26, 4, 22);
        g.fillStyle = "rgba(255,255,255,0.2)";
        g.fillRect(x, y, TILE, 3);
      } else if (ch === "?" || ch === "M" || ch === "S") {
        const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 180 + c);
        g.fillStyle = th.brick;
        g.fillRect(x, y, TILE, TILE);
        g.fillStyle = th.brickDark;
        g.fillRect(x, y, TILE, 4); g.fillRect(x, y + TILE - 4, TILE, 4);
        g.fillRect(x, y, 4, TILE); g.fillRect(x + TILE - 4, y, 4, TILE);
        g.fillStyle = "#ffffff";
        g.globalAlpha = pulse;
        g.font = '22px "Press Start 2P", monospace';
        g.textAlign = "center";
        g.fillText("?", x + TILE / 2, y + 34);
        g.globalAlpha = 1;
        g.fillStyle = th.brickDark;
        for (const [dx, dy] of [[6, 6], [38, 6], [6, 38], [38, 38]]) g.fillRect(x + dx, y + dy, 4, 4);
      } else if (ch === "U") {
        g.fillStyle = th.brickDark;
        g.fillRect(x, y, TILE, TILE);
        g.fillStyle = "rgba(0,0,0,0.3)";
        g.fillRect(x + 6, y + 6, TILE - 12, TILE - 12);
      } else if (ch === "T" || ch === "P") {
        g.fillStyle = th.accent;
        g.fillRect(x + 2, y, TILE - 4, TILE);
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(x + 8, y, 6, TILE);
        g.fillStyle = "rgba(0,0,0,0.28)";
        g.fillRect(x + TILE - 12, y, 8, TILE);
        if (ch === "T") {
          g.fillStyle = th.accent;
          g.fillRect(x - 2, y, TILE + 4, 14);
          g.fillStyle = "rgba(255,255,255,0.4)";
          g.fillRect(x - 2, y, TILE + 4, 4);
        }
      } else if (ch === "^") {
        g.fillStyle = th.ambient === "embers" ? "#ff5d2e" : "#e8e8f0";
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(x + i * 16, y + TILE);
          g.lineTo(x + i * 16 + 8, y + 12);
          g.lineTo(x + i * 16 + 16, y + TILE);
          g.fill();
        }
        g.fillStyle = th.ambient === "embers" ? "#ffd23f" : "#9a9ab0";
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(x + i * 16 + 4, y + TILE);
          g.lineTo(x + i * 16 + 8, y + 22);
          g.lineTo(x + i * 16 + 12, y + TILE);
          g.fill();
        }
      }
    }
  }

  private drawPlatforms(g: CanvasRenderingContext2D) {
    const th = this.theme;
    for (const pl of this.platforms) {
      g.fillStyle = th.brick;
      g.fillRect(pl.x, pl.y, pl.w, pl.h);
      g.fillStyle = th.groundTop;
      g.fillRect(pl.x, pl.y, pl.w, 6);
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(pl.x, pl.y + pl.h - 5, pl.w, 5);
      g.fillStyle = th.brickDark;
      for (let i = 0; i < 4; i++) g.fillRect(pl.x + 14 + i * 34, pl.y + 8, 8, 5);
    }
  }

  private drawCoins(g: CanvasRenderingContext2D) {
    const t = performance.now() / 300;
    for (const c of this.coinsEnt) {
      if (c.taken) continue;
      const sx = Math.abs(Math.cos(t + c.x * 0.05));
      const w = 6 + sx * 12;
      const bob = Math.sin(t * 0.8 + c.x) * 3;
      g.fillStyle = "#d99a12";
      g.fillRect(c.x + 12 - w / 2, c.y + bob, w, 26);
      g.fillStyle = "#ffd23f";
      g.fillRect(c.x + 12 - w / 2 + 2, c.y + bob + 2, Math.max(2, w - 4), 22);
      g.fillStyle = "#fff3c0";
      g.fillRect(c.x + 12 - w / 2 + 3, c.y + bob + 4, Math.max(1, w / 3), 8);
    }
  }

  private drawItems(g: CanvasRenderingContext2D) {
    for (const it of this.items) {
      if (it.kind === "mush") {
        g.fillStyle = "#ffe4d0";
        g.fillRect(it.x + 6, it.y + 18, it.w - 12, it.h - 18);
        g.fillStyle = "#ff5d5d";
        g.beginPath();
        g.arc(it.x + it.w / 2, it.y + 18, 18, Math.PI, 0);
        g.fill();
        g.fillStyle = "#ffffff";
        g.fillRect(it.x + 8, it.y + 6, 8, 8);
        g.fillRect(it.x + 22, it.y + 8, 7, 7);
        g.fillStyle = "#0b0e1f";
        g.fillRect(it.x + 11, it.y + 24, 4, 6);
        g.fillRect(it.x + 21, it.y + 24, 4, 6);
      } else {
        const t = performance.now() / 120;
        g.save();
        g.translate(it.x + it.w / 2, it.y + it.h / 2);
        g.rotate(Math.sin(t * 0.4) * 0.3);
        g.fillStyle = ["#ffd23f", "#fff3c0"][Math.floor(t / 2) % 2];
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 === 0 ? 19 : 8;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
        g.fillStyle = "#0b0e1f";
        g.fillRect(-6, -3, 4, 6);
        g.fillRect(3, -3, 4, 6);
        g.restore();
      }
    }
  }

  private drawChecks(g: CanvasRenderingContext2D) {
    for (const ck of this.checks) {
      const x = ck.x;
      g.fillStyle = "#8b8ba6";
      g.fillRect(x + 20, ck.y, 6, ck.y + TILE * 3 - ck.y);
      g.fillStyle = ck.taken ? "#46e6e0" : "#8b8ba6";
      g.beginPath();
      g.moveTo(x + 26, ck.y + 4);
      g.lineTo(x + 56, ck.y + 14);
      g.lineTo(x + 26, ck.y + 26);
      g.fill();
      if (ck.taken) {
        g.fillStyle = "#ffffff";
        g.fillRect(x + 22, ck.y - 6, 4, 4);
      }
    }
  }

  private drawFlag(g: CanvasRenderingContext2D) {
    const f = this.flag;
    if (!f) return;
    g.fillStyle = "#c8c8d8";
    g.fillRect(f.x, f.topY, 8, f.groundY - f.topY);
    g.fillStyle = "#ffd23f";
    g.beginPath();
    g.arc(f.x + 4, f.topY - 4, 9, 0, 7);
    g.fill();
    const fy = f.reached ? f.groundY - 60 : f.topY + 10;
    g.fillStyle = this.theme.accent;
    g.beginPath();
    g.moveTo(f.x + 8, fy);
    g.lineTo(f.x + 46, fy + 14);
    g.lineTo(f.x + 8, fy + 30);
    g.fill();
    g.fillStyle = "#ffffff";
    g.fillRect(f.x + 14, fy + 10, 8, 8);
    // petit château après le drapeau
    const cx = f.x + TILE * 3;
    const cy = f.groundY;
    g.fillStyle = this.theme.brick;
    g.fillRect(cx, cy - 90, 120, 90);
    g.fillStyle = this.theme.brickDark;
    for (let i = 0; i < 4; i++) g.fillRect(cx + i * 32, cy - 108, 20, 20);
    g.fillStyle = "#0b0e1f";
    g.beginPath();
    g.arc(cx + 60, cy - 34, 18, Math.PI, 0);
    g.fill();
    g.fillRect(cx + 42, cy - 34, 36, 34);
    g.fillRect(cx + 14, cy - 72, 14, 14);
    g.fillRect(cx + 92, cy - 72, 14, 14);
  }

  private drawEnemy(g: CanvasRenderingContext2D, e: Enemy) {
    const squash = e.dead ? Math.max(0, e.squash / 0.4) : 1;
    const h = e.h * (e.dead ? 0.3 + 0.2 * squash : 1);
    const y = e.y + e.h - h;
    g.save();
    if (e.dead) g.globalAlpha = squash;
    if (e.kind === "f") {
      const flap = Math.sin(e.t * 14) * 8;
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.ellipse(e.x - 4, e.y + 8 - flap, 12, 7, -0.4, 0, 7);
      g.ellipse(e.x + e.w + 4, e.y + 8 - flap, 12, 7, 0.4, 0, 7);
      g.fill();
    }
    const bodyCol = e.kind === "s" ? "#3c3c55" : e.kind === "f" ? "#b06ae0" : "#c9502c";
    g.fillStyle = bodyCol;
    g.beginPath();
    g.arc(e.x + e.w / 2, y + h * 0.55, e.w / 2, Math.PI, 0);
    g.fill();
    g.fillRect(e.x, y + h * 0.55, e.w, h * 0.45);
    if (e.kind === "s") {
      g.fillStyle = "#ffd23f";
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(e.x + 2 + i * 8, y + h * 0.4);
        g.lineTo(e.x + 6 + i * 8, y - 8);
        g.lineTo(e.x + 10 + i * 8, y + h * 0.4);
        g.fill();
      }
    }
    // pieds
    if (!e.dead) {
      const step = Math.sin(e.t * 10) * 3;
      g.fillStyle = "#0b0e1f";
      g.fillRect(e.x + 2, y + h - 6 + step, 12, 6 - step);
      g.fillRect(e.x + e.w - 14, y + h - 6 - step, 12, 6 + step);
    }
    // yeux
    const ex = e.x + e.w / 2 + e.dir * 5;
    g.fillStyle = "#ffffff";
    g.fillRect(ex - 10, y + h * 0.34, 8, 10);
    g.fillRect(ex + 2, y + h * 0.34, 8, 10);
    g.fillStyle = "#0b0e1f";
    g.fillRect(ex - 7 + e.dir * 2, y + h * 0.34 + 4, 4, 6);
    g.fillRect(ex + 4 + e.dir * 2, y + h * 0.34 + 4, 4, 6);
    if (e.kind !== "s") {
      g.fillStyle = "#0b0e1f";
      g.fillRect(ex - 12, y + h * 0.28, 10, 3);
      g.fillRect(ex + 2, y + h * 0.28, 10, 3);
    }
    g.restore();
  }

  private drawBoss(g: CanvasRenderingContext2D, b: Boss) {
    const th = this.theme;
    g.save();
    if (b.inv > 0 && Math.floor(b.inv * 12) % 2 === 0) g.globalAlpha = 0.5;
    // corps blob
    g.fillStyle = "#a02850";
    g.beginPath();
    g.arc(b.x + b.w / 2, b.y + b.h * 0.55, b.w / 2, Math.PI, 0);
    g.fill();
    g.fillRect(b.x, b.y + b.h * 0.55, b.w, b.h * 0.45);
    g.fillStyle = "#c83868";
    g.beginPath();
    g.arc(b.x + b.w / 2, b.y + b.h * 0.5, b.w / 2 - 10, Math.PI, 0);
    g.fill();
    // taches
    g.fillStyle = "#7a1838";
    g.fillRect(b.x + 14, b.y + 50, 14, 14);
    g.fillRect(b.x + b.w - 30, b.y + 62, 14, 14);
    g.fillRect(b.x + b.w / 2 - 6, b.y + 76, 12, 12);
    // couronne
    g.fillStyle = "#ffd23f";
    g.beginPath();
    g.moveTo(b.x + b.w / 2 - 30, b.y + 8);
    g.lineTo(b.x + b.w / 2 - 30, b.y - 18);
    g.lineTo(b.x + b.w / 2 - 15, b.y - 2);
    g.lineTo(b.x + b.w / 2, b.y - 22);
    g.lineTo(b.x + b.w / 2 + 15, b.y - 2);
    g.lineTo(b.x + b.w / 2 + 30, b.y - 18);
    g.lineTo(b.x + b.w / 2 + 30, b.y + 8);
    g.fill();
    g.fillStyle = "#e6332a";
    for (let i = 0; i < b.hp; i++) g.fillRect(b.x + b.w / 2 - 24 + i * 11, b.y - 6, 7, 7);
    // yeux
    const look = Math.sign(this.p.x - b.x) || -1;
    g.fillStyle = "#ffffff";
    g.fillRect(b.x + b.w / 2 - 34, b.y + 26, 26, 26);
    g.fillRect(b.x + b.w / 2 + 8, b.y + 26, 26, 26);
    g.fillStyle = "#0b0e1f";
    g.fillRect(b.x + b.w / 2 - 26 + look * 5, b.y + 34, 12, 14);
    g.fillRect(b.x + b.w / 2 + 16 + look * 5, b.y + 34, 12, 14);
    // bouche
    g.fillStyle = "#3c0a18";
    g.fillRect(b.x + b.w / 2 - 24, b.y + 62, 48, 14);
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 4; i++) g.fillRect(b.x + b.w / 2 - 20 + i * 12, b.y + 62, 7, 6);
    // pieds
    g.fillStyle = "#7a1838";
    const step = Math.sin(performance.now() / 90) * 3;
    g.fillRect(b.x + 8, b.y + b.h - 10 + step, 26, 10 - step);
    g.fillRect(b.x + b.w - 34, b.y + b.h - 10 - step, 26, 10 + step);
    g.restore();
    // barre de vie
    const bw = 130;
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(b.x + b.w / 2 - bw / 2 - 2, b.y - 36, bw + 4, 12);
    g.fillStyle = "#e6332a";
    g.fillRect(b.x + b.w / 2 - bw / 2, b.y - 34, bw * (b.hp / b.maxHp), 8);
    g.fillStyle = th.accent;
    g.fillRect(b.x + b.w / 2 - bw / 2, b.y - 34, bw * (b.hp / b.maxHp), 3);
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const p = this.p;
    if (p.inv > 0 && p.star <= 0 && Math.floor(p.inv * 12) % 2 === 0 && !p.dead) return;
    const t = performance.now() / 1000;
    let hat = "#e6332a", shirt = "#e6332a";
    if (p.star > 0) {
      const cols = ["#e6332a", "#ffd23f", "#35c24b", "#3fa9f5", "#ff8ac2"];
      const i = Math.floor(t * 12) % cols.length;
      hat = cols[i]; shirt = cols[(i + 2) % cols.length];
    }
    const scale = p.powered ? 1.16 : 1;
    const w = p.w * scale, h = p.h * scale;
    const x = p.x + p.w / 2 - w / 2, y = p.y + p.h - h;
    g.save();
    if (p.dead) {
      g.translate(x + w / 2, y + h / 2);
      g.rotate(p.deadT * 6);
      g.translate(-(x + w / 2), -(y + h / 2));
    }
    g.translate(x + w / 2, 0);
    g.scale(p.face, 1);
    g.translate(-(x + w / 2), 0);

    const walking = Math.abs(p.vx) > 30 && p.onGround;
    const leg = walking ? Math.sin(p.animT * 0.35) * 5 : 0;
    const airLeg = !p.onGround ? 4 : 0;

    // jambes / chaussures
    g.fillStyle = "#6b3410";
    g.fillRect(x + 1, y + h - 9 + Math.max(0, leg), 12, 9 - Math.max(0, leg));
    g.fillRect(x + w - 13, y + h - 9 + Math.max(0, -leg), 12, 9 - Math.max(0, -leg));
    // salopette
    g.fillStyle = "#2b5cd9";
    g.fillRect(x + 3, y + h * 0.48, w - 6, h * 0.36 - airLeg);
    // bras
    g.fillStyle = shirt;
    g.fillRect(x - 2, y + h * 0.46, 7, h * 0.24);
    g.fillRect(x + w - 5, y + h * 0.46, 7, h * 0.24);
    g.fillStyle = "#ffcf9e";
    g.fillRect(x - 2, y + h * 0.66, 7, 7);
    g.fillRect(x + w - 5, y + h * 0.66, 7, 7);
    // torse
    g.fillStyle = shirt;
    g.fillRect(x + 3, y + h * 0.36, w - 6, h * 0.18);
    // bretelles
    g.fillStyle = "#2b5cd9";
    g.fillRect(x + 6, y + h * 0.36, 5, h * 0.14);
    g.fillRect(x + w - 11, y + h * 0.36, 5, h * 0.14);
    g.fillStyle = "#ffd23f";
    g.fillRect(x + 6, y + h * 0.46, 5, 4);
    g.fillRect(x + w - 11, y + h * 0.46, 5, 4);
    // tête
    g.fillStyle = "#ffcf9e";
    g.fillRect(x + 4, y + 8, w - 8, h * 0.3);
    // casquette
    g.fillStyle = hat;
    g.fillRect(x + 2, y, w - 4, 10);
    g.fillRect(x + w - 12, y + 5, 15, 5);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(x + w / 2 - 2, y + 5, 5, 0, 7);
    g.fill();
    // œil + moustache
    g.fillStyle = "#0b0e1f";
    g.fillRect(x + w - 12, y + 13, 4, 6);
    g.fillStyle = "#6b3410";
    g.fillRect(x + w - 16, y + 22, 12, 4);
    // traînée d'étoile
    if (p.star > 0) {
      g.globalAlpha = 0.5;
      g.fillStyle = "#ffd23f";
      for (let i = 1; i <= 3; i++) {
        g.globalAlpha = 0.35 / i;
        g.fillRect(x - p.face * i * 12, y + 6, w, h - 10);
      }
      g.globalAlpha = 1;
    }
    g.restore();
  }

  private drawHUD(g: CanvasRenderingContext2D) {
    const p = this.p;
    g.save();
    g.font = '13px "Press Start 2P", monospace';
    g.textAlign = "left";
    const txt = (s: string, x: number, y: number, col = "#ffffff") => {
      g.fillStyle = "#0b0e1f";
      g.fillText(s, x + 2, y + 2);
      g.fillStyle = col;
      g.fillText(s, x, y);
    };

    // Bandeau supérieur
    g.fillStyle = "rgba(6,8,22,0.72)";
    g.fillRect(0, 0, VW, 44);
    g.fillStyle = this.theme.accent;
    g.fillRect(0, 44, VW, 3);

    txt("SCORE", 16, 16, "#9fe0ff");
    txt(String(this.score).padStart(6, "0"), 16, 34);

    // pièce + compteur
    const flash = this.hudFlash > 0 && Math.floor(this.hudFlash * 20) % 2 === 0;
    g.fillStyle = flash ? "#fff3c0" : "#ffd23f";
    g.beginPath();
    g.ellipse(190, 26, 8, 10, 0, 0, 7);
    g.fill();
    g.fillStyle = "#d99a12";
    g.fillRect(188, 20, 3, 12);
    txt(`×${String(this.coinCount).padStart(2, "0")}`, 204, 32, flash ? "#fff3c0" : "#ffd23f");

    // Monde
    const th = this.theme;
    g.textAlign = "center";
    txt(th.sub, VW / 2, 16, "#ffd23f");
    g.font = '11px "Press Start 2P", monospace';
    txt(th.name.toUpperCase(), VW / 2, 34, "#ffffff");

    // Temps
    g.textAlign = "right";
    g.font = '13px "Press Start 2P", monospace';
    const tl = Math.max(0, Math.ceil(this.timeLeft));
    txt("TEMPS", VW - 96, 16, "#9fe0ff");
    txt(String(tl).padStart(3, "0"), VW - 96, 34, tl <= 60 ? "#ff5d5d" : "#ffffff");

    // Vies
    g.fillStyle = "#e6332a";
    g.fillRect(VW - 66, 10, 22, 8);
    g.fillRect(VW - 70, 16, 30, 4);
    g.fillStyle = "#ffcf9e";
    g.fillRect(VW - 66, 20, 22, 10);
    g.fillStyle = "#0b0e1f";
    g.fillRect(VW - 52, 22, 3, 5);
    txt(`×${this.lives}`, VW - 16, 34, "#ff8ac2");

    // Jauge de dash
    const bx = 16, by = VH - 34, bw = 150, bh = 14;
    const ready = p.dashCd <= 0;
    const frac = ready ? 1 : 1 - p.dashCd / DASH_CD;
    g.fillStyle = "rgba(6,8,22,0.72)";
    g.fillRect(bx - 6, by - 22, bw + 70, 46);
    g.font = '10px "Press Start 2P", monospace';
    g.textAlign = "left";
    txt("DASH", bx, by - 8, ready ? "#ffd23f" : "#9fe0ff");
    // éclair
    g.fillStyle = ready ? "#ffd23f" : "#5a6a9a";
    g.beginPath();
    g.moveTo(bx + 52, by - 16); g.lineTo(bx + 44, by - 5); g.lineTo(bx + 50, by - 5);
    g.lineTo(bx + 46, by + 2); g.lineTo(bx + 58, by - 9); g.lineTo(bx + 52, by - 9);
    g.closePath();
    g.fill();
    g.fillStyle = "#0b0e1f";
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = ready ? (Math.floor(performance.now() / 200) % 2 ? "#ffd23f" : "#ffe896") : "#3fa9f5";
    g.fillRect(bx + 2, by + 2, (bw - 4) * frac, bh - 4);
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(bx + 2, by + 2, (bw - 4) * frac, 4);

    // Combo
    if (this.combo > 1 && this.comboT > 0) {
      g.textAlign = "center";
      g.font = '16px "Press Start 2P", monospace';
      const sc = 1 + Math.sin(this.comboT * 10) * 0.08;
      g.save();
      g.translate(VW / 2, 76);
      g.scale(sc, sc);
      txt(`COMBO ×${this.combo}`, 0, 0, "#ff8ac2");
      g.restore();
    }

    if (this.audio.muted) {
      g.textAlign = "right";
      g.font = '10px "Press Start 2P", monospace';
      txt("MUET", VW - 16, VH - 16, "#9fe0ff");
    }
    g.restore();
  }
}
