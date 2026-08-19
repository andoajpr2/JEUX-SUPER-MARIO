import { useEffect, useRef, useState } from "react";
import { Engine } from "./game/engine";
import type { Phase, Stats } from "./game/engine";
import { LEVELS, THEMES } from "./game/levels";

const ZERO: Stats = { score: 0, coins: 0, lives: 3, levelIdx: 0, deaths: 0, best: 0 };

function rank(s: Stats): { letter: string; col: string; label: string } {
  if (s.deaths === 0 && s.score > 38000) return { letter: "S", col: "#ffd23f", label: "LÉGENDE DU ROYAUME" };
  if (s.deaths <= 3 && s.score > 28000) return { letter: "A", col: "#7ae08a", label: "HÉROS CONFIRMÉ" };
  if (s.deaths <= 8) return { letter: "B", col: "#7cc4ff", label: "AVENTURIER SOLIDE" };
  return { letter: "C", col: "#ff8ac2", label: "SURVIVANT ACCROCHEUR" };
}

const Svg = {
  play: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M3 1l11 7-11 7z" />
    </svg>
  ),
  left: (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M11 1L4 8l7 7V1z" />
    </svg>
  ),
  right: (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M5 1l7 7-7 7V1z" />
    </svg>
  ),
  up: (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M1 11l7-7 7 7H1z" />
    </svg>
  ),
  bolt: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M9 0L2 9h5l-2 7 8-10H8l1-6z" />
    </svg>
  ),
  sound: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M2 6h3l4-4v12L5 10H2z" />
      <path d="M11 5c1.5 1.5 1.5 4.5 0 6M13 3c2.5 2.5 2.5 7.5 0 10" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  ),
  mute: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M2 6h3l4-4v12L5 10H2z" />
      <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  ),
};

function Key({ k, wide = false }: { k: string; wide?: boolean }) {
  return <span className="keycap" style={wide ? { minWidth: 56 } : undefined}>{k}</span>;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engRef = useRef<Engine | null>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [stats, setStats] = useState<Stats>(ZERO);
  const [muted, setMuted] = useState(false);
  const [isTouch] = useState(() => typeof window !== "undefined" && "ontouchstart" in window);

  useEffect(() => {
    const eng = new Engine(canvasRef.current!, (p, s) => {
      setPhase(p);
      setStats(s);
    });
    engRef.current = eng;
    return () => eng.destroy();
  }, []);

  useEffect(() => {
    if (phase === "card") {
      const t = setTimeout(() => engRef.current?.beginPlay(), 1900);
      return () => clearTimeout(t);
    }
  }, [phase, stats.levelIdx, stats.deaths]);

  const eng = () => engRef.current!;
  const theme = THEMES[LEVELS[stats.levelIdx].theme];
  const isBossCard = LEVELS[stats.levelIdx].boss;

  const hold = (k: "left" | "right" | "jump" | "dash") => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); eng().setControl(k, true); },
    onPointerUp: () => eng().setControl(k, false),
    onPointerCancel: () => eng().setControl(k, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-3 py-4"
      style={{
        background:
          "radial-gradient(circle at 18% 12%, #1d2547 0%, transparent 42%), radial-gradient(circle at 85% 88%, #251741 0%, transparent 46%), radial-gradient(rgba(255,255,255,0.045) 1.2px, transparent 1.2px) 0 0/26px 26px, #0b0e1f",
      }}
    >
      {/* Barre au-dessus du cadre */}
      <div className="w-full max-w-[1060px] flex items-end justify-between mb-2 px-1">
        <div className="flex items-center gap-3">
          <span className="font-display text-[13px] text-[#ffd23f]" style={{ textShadow: "2px 2px 0 #7c130d" }}>
            SUPER PLOMBO
          </span>
          <span className="font-body text-lg text-[#9fe0ff] leading-none pb-[2px]">— un platformer rétro en {LEVELS.length} mondes</span>
        </div>
        <button
          className="flex items-center gap-2 font-display text-[10px] text-white/90 border-2 border-white/40 px-3 py-2 hover:bg-white/10 transition-colors"
          onClick={() => { eng().audio.unlock(); setMuted(eng().audio.toggleMute()); }}
        >
          {muted ? Svg.mute : Svg.sound}
          {muted ? "SON COUPÉ" : "SON ACTIF"}
        </button>
      </div>

      {/* Cadre de jeu */}
      <div className="relative w-full max-w-[1060px] border-4 border-[#2c3160] shadow-[0_0_0_4px_#0b0e1f,0_18px_50px_rgba(0,0,0,0.6),0_0_60px_rgba(63,169,245,0.12)]" style={{ aspectRatio: "16/9" }}>
        <canvas ref={canvasRef} className="game-canvas" />
        <div className="absolute inset-0 scanlines" />
        <div className="absolute inset-0 vignette" />

        {/* ===== ÉCRAN TITRE ===== */}
        {phase === "title" && (
          <div className="absolute inset-0 flex flex-col items-center justify-between py-6 px-4" style={{ background: "linear-gradient(180deg, rgba(6,8,24,0.62) 0%, rgba(6,8,24,0.85) 100%)" }}>
            <div className="text-center anim-pop">
              <div className="font-body text-[22px] tracking-[0.35em] text-[#9fe0ff] mb-2">ROYAUME CHAMPIGNON PRÉSENTE</div>
              <h1 className="font-display text-[#ff5d4e] logo-shadow leading-none anim-bob" style={{ fontSize: "clamp(28px, 6vw, 58px)" }}>
                SUPER PLOMBO
              </h1>
              <div className="mt-3 inline-block bg-[#ffd23f] text-[#4a2c00] font-display px-4 py-2 border-[3px] border-[#0b0e1f] shadow-[0_5px_0_#0b0e1f] -rotate-2" style={{ fontSize: "clamp(12px, 2.4vw, 22px)" }}>
                ★ RÉVOLUTION ★
              </div>
              <div className="font-body text-[20px] text-white/85 mt-3">{LEVELS.length} mondes · boss final · dash · combos · checkpoints</div>
            </div>

            <div className="flex flex-col items-center gap-4 w-full">
              <button className="btn-pixel btn-red flex items-center gap-3" style={{ fontSize: 16 }} onClick={() => eng().startGame()}>
                {Svg.play} JOUER
              </button>
              <div className="font-body text-[19px] text-[#ffd23f] anim-blink">— ou appuie sur ENTRÉE —</div>
              {stats.best > 0 && (
                <div className="font-display text-[11px] text-[#9fe0ff]">RECORD&nbsp;: {String(stats.best).padStart(6, "0")}</div>
              )}
            </div>

            <div className="panel-retro px-5 py-4 w-full max-w-[720px]">
              <div className="font-display text-[10px] text-[#ffd23f] mb-3 text-center">COMMANDES</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 font-body text-[19px] text-white/90 leading-none items-center">
                <div className="flex items-center gap-2"><Key k="Z" /><Key k="Q" /><Key k="S" /><Key k="D" /><span className="ml-1">bouger</span></div>
                <div className="flex items-center gap-2"><Key k="ESPACE" wide /><span className="ml-1">sauter</span></div>
                <div className="flex items-center gap-2"><Key k="MAJ" wide /><span className="ml-1">dash</span></div>
                <div className="flex items-center gap-2"><Key k="P" /><Key k="M" /><span className="ml-1">pause · son</span></div>
              </div>
              <div className="font-body text-[17px] text-white/60 text-center mt-3">
                Saute sur les ennemis, enchaîne les combos, fonce avec le dash — et ne touche jamais les piques.
              </div>
            </div>
          </div>
        )}

        {/* ===== CARTE DE MONDE ===== */}
        {phase === "card" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div key={`${stats.levelIdx}-${stats.deaths}`} className="anim-card panel-retro px-8 py-5 text-center" style={{ borderColor: theme.accent }}>
              <div className="font-display text-[12px] text-[#9fe0ff] mb-2">{theme.sub} / {LEVELS.length}</div>
              <div className="font-display text-[#ffd23f] logo-shadow" style={{ fontSize: "clamp(16px, 3vw, 26px)" }}>
                {theme.name.toUpperCase()}
              </div>
              <div className="font-body text-[20px] text-white/85 mt-2">
                {isBossCard ? "Le Roi Blob t'attend... saute sur sa tête 5 fois !" : "C'EST PARTI !"}
              </div>
              <div className="flex justify-center gap-1.5 mt-3">
                {LEVELS.map((l, i) => (
                  <span key={i} className="inline-block w-3 h-3 border border-black/40" style={{ background: i < stats.levelIdx ? THEMES[l.theme].accent : i === stats.levelIdx ? "#ffd23f" : "rgba(255,255,255,0.15)" }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== PAUSE ===== */}
        {phase === "paused" && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(6,8,24,0.8)" }}>
            <div className="panel-retro px-8 py-6 text-center anim-pop flex flex-col items-center gap-4">
              <div className="font-display text-[26px] text-[#ffd23f] logo-shadow">PAUSE</div>
              <div className="font-body text-[19px] text-white/80 flex flex-col gap-1 items-start">
                <span><b className="text-[#9fe0ff]">ZQSD / Flèches</b> — se déplacer</span>
                <span><b className="text-[#9fe0ff]">Espace</b> — sauter (reste appuyé = plus haut)</span>
                <span><b className="text-[#9fe0ff]">Maj / X</b> — dash (traverse les ennemis)</span>
                <span><b className="text-[#9fe0ff]">Écrase</b> — les ennemis pour comboter</span>
              </div>
              <div className="flex gap-3 flex-wrap justify-center">
                <button className="btn-pixel btn-green" onClick={() => eng().togglePause()}>REPRENDRE</button>
                <button className="btn-pixel btn-blue" onClick={() => eng().quitToTitle()}>MENU</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== GAME OVER ===== */}
        {phase === "gameover" && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(20,4,8,0.86)" }}>
            <div className="text-center anim-pop flex flex-col items-center gap-4 px-4">
              <div className="font-display text-[#ff5d4e] logo-shadow anim-bob-slow" style={{ fontSize: "clamp(26px, 5vw, 46px)" }}>GAME OVER</div>
              <div className="font-body text-[22px] text-white/85">
                Le Royaume s'assombrit... mais un plombier ne renonce jamais.
              </div>
              <div className="panel-retro px-6 py-4 font-display text-[12px] flex flex-col gap-2">
                <span className="text-white">SCORE&nbsp;: <span className="text-[#ffd23f]">{String(stats.score).padStart(6, "0")}</span></span>
                <span className="text-white">MONDES&nbsp;: <span className="text-[#9fe0ff]">{stats.levelIdx + 1} / {LEVELS.length}</span></span>
                <span className="text-white">PIÈCES&nbsp;: <span className="text-[#ffd23f]">{stats.coins}</span></span>
                <span className="text-[#7ae08a]">{stats.score >= stats.best && stats.score > 0 ? "★ NOUVEAU RECORD ! ★" : `RECORD : ${String(stats.best).padStart(6, "0")}`}</span>
              </div>
              <div className="flex gap-3 flex-wrap justify-center">
                <button className="btn-pixel btn-red flex items-center gap-2" onClick={() => eng().startGame()}>{Svg.play} RÉESSAYER</button>
                <button className="btn-pixel btn-blue" onClick={() => eng().quitToTitle()}>MENU</button>
              </div>
              <div className="font-body text-[18px] text-white/50">ENTRÉE pour repartir à l'aventure</div>
            </div>
          </div>
        )}

        {/* ===== VICTOIRE ===== */}
        {phase === "victory" && (() => {
          const r = rank(stats);
          return (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(8,6,26,0.88)" }}>
              <div className="text-center anim-pop flex flex-col items-center gap-4 px-4">
                <div className="font-display text-[#ffd23f] logo-shadow" style={{ fontSize: "clamp(24px, 5vw, 44px)" }}>ROYAUME SAUVÉ !</div>
                <div className="font-body text-[22px] text-white/85">Le Roi Blob est vaincu. Les {LEVELS.length} mondes sont en fête.</div>
                <div className="relative panel-retro px-8 py-5 font-display text-[12px] flex flex-col gap-2">
                  <div className="anim-rank absolute -right-8 -top-8 font-display text-[54px] w-[86px] h-[86px] flex items-center justify-center border-4 border-[#0b0e1f]" style={{ color: "#0b0e1f", background: r.col, boxShadow: "0 6px 0 #0b0e1f" }}>
                    {r.letter}
                  </div>
                  <span className="text-white text-left">SCORE&nbsp;&nbsp;: <span className="text-[#ffd23f]">{String(stats.score).padStart(6, "0")}</span></span>
                  <span className="text-white text-left">PIÈCES&nbsp;: <span className="text-[#ffd23f]">{stats.coins}</span></span>
                  <span className="text-white text-left">MORTS&nbsp;&nbsp;: <span className="text-[#ff8ac2]">{stats.deaths}</span></span>
                  <span className="text-[#9fe0ff] text-left mt-1">{r.label}</span>
                </div>
                <div className="flex gap-3 flex-wrap justify-center">
                  <button className="btn-pixel btn-gold flex items-center gap-2" onClick={() => eng().startGame()}>{Svg.play} REJOUER</button>
                  <button className="btn-pixel btn-blue" onClick={() => eng().quitToTitle()}>MENU</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ===== CONTRÔLES TACTILES ===== */}
        {isTouch && phase === "playing" && (
          <div className="absolute inset-x-0 bottom-2 px-3 flex justify-between items-end pointer-events-none select-none">
            <div className="flex gap-2 pointer-events-auto">
              <button className="touch-btn w-16 h-16" {...hold("left")}>{Svg.left}</button>
              <button className="touch-btn w-16 h-16" {...hold("right")}>{Svg.right}</button>
            </div>
            <div className="flex gap-2 items-end pointer-events-auto">
              <button className="touch-btn w-16 h-16 text-[#ffd23f]" {...hold("dash")}>{Svg.bolt}</button>
              <button className="touch-btn w-20 h-20" {...hold("jump")}>{Svg.up}</button>
            </div>
          </div>
        )}
      </div>

      {/* Légende sous le cadre */}
      <div className="w-full max-w-[1060px] flex items-center justify-between mt-2 px-1 font-body text-[17px] text-white/45">
        <span>100 pièces = 1 vie · le dash rend invincible un instant · P = pause</span>
        <span className="hidden md:flex items-center gap-1.5">
          {LEVELS.map((l, i) => (
            <span key={i} title={THEMES[l.theme].name} className="inline-block w-2.5 h-2.5 border border-black/40" style={{ background: THEMES[l.theme].accent }} />
          ))}
        </span>
      </div>
    </div>
  );
}
