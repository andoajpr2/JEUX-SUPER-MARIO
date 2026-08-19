/* Définition des mondes : thèmes visuels + construction des niveaux.
   Légende de la grille :
   X sol · B brique · ? bloc pièce · M bloc champignon · S bloc étoile · U usé
   n haut de tuyau · ^ piques/lave · o pièce · g goomba · f volant · s piquant
   m plateforme horizontale · v plateforme verticale · C checkpoint · F drapeau · K boss */

export const ROWS = 14;
export const TILE = 48;

export interface Theme {
  name: string;
  sub: string;
  skyTop: string;
  skyBot: string;
  far: string;
  near: string;
  groundTop: string;
  groundBody: string;
  brick: string;
  brickDark: string;
  accent: string;
  ambient: "none" | "snow" | "embers" | "firefly" | "stars" | "clouds";
  music: number;
  tempo: number;
  slippery?: boolean;
}

export const THEMES: Theme[] = [
  { name: "Plaines Champignon", sub: "MONDE 1", skyTop: "#2a8df0", skyBot: "#9fe0ff", far: "#57c84d", near: "#2f9e44", groundTop: "#67d44f", groundBody: "#d9822b", brick: "#c9502c", brickDark: "#8c2f16", accent: "#3bb54a", ambient: "clouds", music: 0, tempo: 144 },
  { name: "Collines du Couchant", sub: "MONDE 2", skyTop: "#ff8f3c", skyBot: "#ffd98a", far: "#b0486b", near: "#7c2d56", groundTop: "#ffca58", groundBody: "#a4552a", brick: "#b3452a", brickDark: "#7c2a16", accent: "#ff5d5d", ambient: "clouds", music: 1, tempo: 138 },
  { name: "Souterrain de Cristal", sub: "MONDE 3", skyTop: "#070a24", skyBot: "#1b2153", far: "#232a63", near: "#39408a", groundTop: "#6a73c9", groundBody: "#343b78", brick: "#4a5296", brickDark: "#2c3160", accent: "#46e6e0", ambient: "stars", music: 2, tempo: 128 },
  { name: "Archipel Céleste", sub: "MONDE 4", skyTop: "#4fc3ff", skyBot: "#d4f4ff", far: "#ffffff", near: "#cdeaff", groundTop: "#ffffff", groundBody: "#a8d8f5", brick: "#f2b53c", brickDark: "#b57f1a", accent: "#ff8ac2", ambient: "clouds", music: 4, tempo: 152 },
  { name: "Glacier Éternel", sub: "MONDE 5", skyTop: "#8fc9f5", skyBot: "#eef9ff", far: "#c3e7ff", near: "#8fc7f2", groundTop: "#ffffff", groundBody: "#7fb8e8", brick: "#9fd8f2", brickDark: "#5f94c0", accent: "#3fa9f5", ambient: "snow", music: 1, tempo: 132, slippery: true },
  { name: "Cœur du Volcan", sub: "MONDE 6", skyTop: "#2a060a", skyBot: "#8c1f16", far: "#5c0f0c", near: "#3c0a08", groundTop: "#8a3a22", groundBody: "#47120c", brick: "#6e241a", brickDark: "#3e120c", accent: "#ff9d2e", ambient: "embers", music: 2, tempo: 140 },
  { name: "Forêt Nocturne", sub: "MONDE 7", skyTop: "#071a2e", skyBot: "#0e3f3a", far: "#0f4a3c", near: "#14604a", groundTop: "#2e9e5b", groundBody: "#175c37", brick: "#2c7a4a", brickDark: "#174a2b", accent: "#ffd23f", ambient: "firefly", music: 2, tempo: 124 },
  { name: "Forteresse Grise", sub: "MONDE 8", skyTop: "#12121c", skyBot: "#34344a", far: "#26263a", near: "#3c3c55", groundTop: "#8b8ba6", groundBody: "#55556e", brick: "#7a7a96", brickDark: "#4a4a62", accent: "#e6332a", ambient: "none", music: 3, tempo: 136 },
  { name: "Nébuleuse", sub: "MONDE 9", skyTop: "#05051c", skyBot: "#331457", far: "#4b1e7a", near: "#6a2ca8", groundTop: "#b06ae0", groundBody: "#5e2a96", brick: "#8a4ac6", brickDark: "#5a2a8a", accent: "#46e6e0", ambient: "stars", music: 4, tempo: 148 },
  { name: "Trône du Roi Blob", sub: "MONDE 10", skyTop: "#16040a", skyBot: "#4a0d14", far: "#5e1018", near: "#7a161f", groundTop: "#a04a4a", groundBody: "#5e2020", brick: "#8c3030", brickDark: "#541a1a", accent: "#ffd23f", ambient: "embers", music: 3, tempo: 152 },
];

class LevelBuilder {
  g: string[][];
  w: number;

  constructor(w: number) {
    this.w = w;
    this.g = Array.from({ length: ROWS }, () => Array<string>(w).fill("."));
  }

  set(x: number, y: number, ch: string) {
    if (x >= 0 && x < this.w && y >= 0 && y < ROWS) this.g[y][x] = ch;
  }

  ground(x0: number, x1: number, top = 12) {
    for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) this.set(x, y, "X");
    return this;
  }

  ceil(x0: number, x1: number) {
    for (let x = x0; x <= x1; x++) {
      this.set(x, 0, "X");
      this.set(x, 1, "X");
    }
    return this;
  }

  bricks(x0: number, x1: number, y: number) {
    for (let x = x0; x <= x1; x++) this.set(x, y, "B");
    return this;
  }

  block(x: number, y: number, ch = "?") {
    this.set(x, y, ch);
    return this;
  }

  coins(x0: number, x1: number, y: number) {
    for (let x = x0; x <= x1; x++) this.set(x, y, "o");
    return this;
  }

  enemy(x: number, type: "g" | "f" | "s" | "K", y = 11) {
    this.set(x, y, type);
    return this;
  }

  spikes(x0: number, x1: number, y = 11) {
    for (let x = x0; x <= x1; x++) this.set(x, y, "^");
    return this;
  }

  pipe(x: number, h: number) {
    this.set(x, 12 - h, "n");
    return this;
  }

  mover(x: number, y: number, type: "m" | "v" = "m") {
    this.set(x, y, type);
    return this;
  }

  cp(x: number, y = 8) {
    this.set(x, y, "C");
    return this;
  }

  flag(x: number, y = 6) {
    this.set(x, y, "F");
    return this;
  }

  stairUp(x: number, n: number) {
    for (let i = 0; i < n; i++)
      for (let y = 11 - i; y < ROWS; y++) this.set(x + i, y, "X");
    return this;
  }

  build(): string[] {
    return this.g.map((r) => r.join(""));
  }
}

function level1() {
  const L = new LevelBuilder(148);
  L.ground(0, 34).ground(37, 64).ground(68, 104).ground(108, 147);
  L.coins(14, 17, 8).block(20, 8).bricks(26, 30, 8).block(28, 8, "M");
  L.enemy(24, "g").enemy(44, "g").enemy(46, "g");
  L.pipe(52, 2).coins(35, 36, 9).coins(58, 62, 6);
  L.bricks(70, 74, 8).block(72, 8).enemy(78, "g").enemy(80, "g");
  L.pipe(86, 3).coins(92, 96, 9).bricks(93, 97, 6).block(95, 6, "?");
  L.coins(65, 67, 9).coins(105, 107, 9);
  L.enemy(112, "g").enemy(114, "g").enemy(116, "f", 8);
  L.bricks(120, 124, 8).block(122, 8, "M").coins(120, 124, 6);
  L.stairUp(132, 4);
  L.flag(142);
  return L.build();
}

function level2() {
  const L = new LevelBuilder(160);
  L.ground(0, 24).ground(28, 54).ground(59, 92).ground(96, 130).ground(135, 159);
  L.enemy(14, "g").enemy(16, "g").enemy(20, "g");
  L.bricks(18, 24, 8).block(21, 8);
  L.coins(25, 27, 9).pipe(32, 2).coins(36, 40, 9).enemy(42, "f", 7);
  L.bricks(44, 48, 8).block(46, 8, "M").enemy(52, "g");
  L.mover(56, 9).coins(55, 58, 7);
  L.pipe(62, 3).enemy(67, "g").enemy(69, "g");
  L.bricks(74, 80, 8).block(77, 8).coins(74, 80, 6);
  L.pipe(86, 2).enemy(89, "f", 6);
  L.bricks(93, 95, 8).coins(93, 95, 6);
  L.bricks(98, 104, 8).block(101, 8, "S");
  L.enemy(108, "g").enemy(110, "g").enemy(112, "g");
  L.mover(114, 8).bricks(118, 124, 5).coins(118, 124, 3);
  L.cp(126).mover(132, 9).coins(131, 134, 7);
  L.enemy(140, "g").enemy(142, "f", 7);
  L.stairUp(146, 4);
  L.flag(154);
  return L.build();
}

function level3() {
  const L = new LevelBuilder(170);
  L.ceil(0, 169);
  L.ground(0, 20).ground(24, 44).ground(49, 70).ground(75, 100).ground(107, 130).ground(134, 169);
  L.spikes(19, 20).coins(21, 23, 9);
  L.enemy(30, "g").enemy(34, "s");
  L.bricks(28, 32, 8).block(30, 8).coins(36, 40, 9);
  L.mover(46, 8, "v").coins(45, 48, 6);
  L.pipe(52, 2).enemy(56, "s").enemy(58, "g");
  L.bricks(60, 66, 8).block(63, 8, "M").spikes(68, 69).coins(68, 69, 8);
  L.mover(72, 9).coins(71, 74, 7);
  L.enemy(80, "g").enemy(82, "g").enemy(84, "s");
  L.bricks(86, 90, 8).block(88, 8).bricks(91, 95, 5).coins(91, 95, 3);
  L.cp(98);
  L.mover(102, 8, "v").mover(105, 8).coins(101, 106, 5);
  L.spikes(112, 113).enemy(116, "s").spikes(118, 119).coins(110, 124, 8);
  L.bricks(122, 128, 8).block(125, 8, "S");
  L.coins(131, 133, 9).enemy(140, "f", 6).enemy(144, "g");
  L.stairUp(150, 4);
  L.flag(158);
  return L.build();
}

function level4() {
  const L = new LevelBuilder(172);
  L.ground(0, 10).ground(138, 171);
  L.coins(4, 7, 9);
  L.bricks(14, 17, 9).coins(14, 17, 7);
  L.mover(21, 8).bricks(25, 28, 7).enemy(26, "f", 5).coins(25, 28, 5);
  L.bricks(32, 35, 9).mover(39, 7, "v");
  L.bricks(43, 46, 6).block(44, 2).coins(43, 46, 4);
  L.mover(50, 8).enemy(53, "f", 6);
  L.bricks(57, 60, 9).bricks(64, 67, 7).bricks(71, 74, 5).coins(57, 60, 7).coins(64, 67, 5).coins(71, 74, 3);
  L.mover(78, 6, "v").bricks(82, 86, 7).enemy(84, "f", 5);
  L.bricks(90, 93, 9).mover(97, 8);
  L.bricks(101, 104, 6).block(102, 2, "M").enemy(107, "f", 5);
  L.bricks(110, 113, 8).coins(110, 113, 6);
  L.bricks(117, 121, 8).cp(119).coins(117, 121, 6);
  L.bricks(125, 128, 9).mover(132, 8).bricks(135, 137, 7);
  L.enemy(144, "g").enemy(146, "g").coins(148, 152, 9).enemy(154, "f", 7);
  L.stairUp(156, 4);
  L.flag(164);
  return L.build();
}

function level5() {
  const L = new LevelBuilder(168);
  L.ground(0, 30).ground(34, 70).ground(76, 110).ground(115, 167);
  L.enemy(16, "g").enemy(26, "g").spikes(22, 23);
  L.mover(32, 9).coins(31, 33, 7);
  L.ground(40, 42, 10).ground(43, 45, 8).coins(40, 45, 6);
  L.enemy(50, "s").bricks(54, 58, 8).block(56, 8, "M").enemy(62, "g").enemy(64, "g");
  L.mover(72, 8, "v").mover(74, 9).coins(71, 75, 6);
  L.spikes(84, 85).enemy(88, "g").spikes(92, 93).enemy(96, "s");
  L.coins(80, 100, 7);
  L.bricks(100, 106, 8).block(103, 8, "S");
  L.mover(112, 8).coins(111, 114, 6);
  L.cp(120).enemy(128, "g").enemy(130, "g").enemy(132, "f", 7);
  L.bricks(136, 140, 6).coins(136, 140, 4);
  L.enemy(144, "s");
  L.stairUp(150, 4);
  L.flag(158);
  return L.build();
}

function level6() {
  const L = new LevelBuilder(174);
  L.ground(0, 26).ground(34, 60).ground(67, 96).ground(107, 140).ground(145, 173);
  L.spikes(16, 17).enemy(20, "s").coins(12, 15, 9);
  L.mover(29, 9).mover(31, 8).coins(28, 33, 6);
  L.enemy(40, "s").enemy(44, "g").pipe(48, 2);
  L.bricks(52, 58, 8).block(55, 8, "M").spikes(58, 59);
  L.mover(63, 8, "v").enemy(62, "f", 5).coins(61, 66, 5);
  L.bricks(72, 78, 8).bricks(74, 80, 5).enemy(76, "f", 3);
  L.block(77, 8).cp(90).enemy(86, "s").enemy(92, "g");
  L.mover(99, 9).mover(102, 7, "v").mover(105, 9).coins(98, 106, 5);
  L.spikes(114, 115).enemy(118, "s").spikes(120, 121).enemy(124, "s").spikes(126, 127);
  L.block(122, 8, "S").coins(112, 128, 7);
  L.mover(142, 8).coins(141, 144, 6);
  L.enemy(150, "f", 7).enemy(154, "s");
  L.stairUp(158, 4);
  L.flag(166);
  return L.build();
}

function level7() {
  const L = new LevelBuilder(174);
  L.ground(0, 22).ground(26, 58).ground(64, 96).ground(103, 136).ground(141, 173);
  L.enemy(12, "g").enemy(14, "g").bricks(16, 20, 8).block(18, 8);
  L.mover(24, 9).coins(23, 25, 7);
  L.enemy(32, "f", 5).enemy(36, "s").enemy(40, "g");
  L.bricks(44, 50, 6).coins(44, 50, 4).block(47, 6, "M");
  L.mover(60, 8, "v").mover(62, 9).coins(59, 63, 6);
  L.spikes(70, 71).enemy(74, "s").enemy(76, "s").cp(86);
  L.bricks(88, 94, 8).block(91, 8);
  L.mover(99, 8).coins(97, 102, 6).enemy(100, "f", 5);
  L.enemy(110, "g").enemy(112, "g").enemy(114, "g").enemy(116, "f", 7);
  L.stairUp(120, 4).coins(120, 123, 6);
  L.bricks(126, 130, 5).coins(126, 130, 3);
  L.mover(138, 9).coins(137, 140, 7);
  L.enemy(146, "s").enemy(150, "f", 7).spikes(152, 153);
  L.stairUp(158, 4);
  L.flag(166);
  return L.build();
}

function level8() {
  const L = new LevelBuilder(172);
  L.ceil(0, 171);
  L.ground(0, 24).ground(28, 56).ground(63, 92).ground(100, 130).ground(136, 171);
  L.enemy(10, "g").enemy(12, "g").bricks(14, 18, 8).block(16, 8).spikes(20, 21);
  L.mover(26, 9).coins(25, 27, 7);
  L.enemy(34, "s").enemy(36, "s").bricks(38, 44, 8).block(41, 8, "M").enemy(46, "f", 5);
  L.mover(59, 8, "v").mover(61, 9).coins(57, 62, 5);
  L.spikes(68, 69).enemy(72, "s").spikes(74, 75);
  L.bricks(76, 82, 8).block(79, 8, "S").cp(88);
  L.mover(95, 9).mover(97, 7, "v").coins(93, 99, 5);
  L.enemy(106, "s").enemy(108, "s").enemy(110, "f", 6);
  L.bricks(112, 118, 8).block(115, 8).spikes(122, 123);
  L.mover(133, 8).coins(131, 135, 6);
  L.enemy(142, "g").enemy(144, "g").enemy(146, "s").enemy(148, "f", 7);
  L.stairUp(154, 4);
  L.flag(162);
  return L.build();
}

function level9() {
  const L = new LevelBuilder(178);
  L.ground(0, 8).ground(144, 177);
  L.coins(3, 6, 9);
  L.mover(12, 9).mover(16, 7, "v").mover(20, 8);
  L.bricks(24, 27, 7).enemy(25, "f", 5).coins(24, 27, 5);
  L.mover(31, 6, "v").mover(35, 8);
  L.bricks(39, 42, 5).block(40, 2, "M").coins(39, 42, 3);
  L.mover(46, 7).mover(50, 9, "v").mover(54, 6);
  L.coins(46, 54, 4);
  L.bricks(58, 62, 8).cp(60).enemy(61, "f", 5);
  L.mover(66, 7, "v").mover(70, 5).mover(74, 8, "v");
  L.bricks(78, 81, 6).coins(78, 81, 4);
  L.mover(85, 8).enemy(87, "f", 6).mover(90, 6, "v").mover(94, 8);
  L.bricks(98, 101, 7).block(100, 3, "S");
  L.mover(105, 8, "v").mover(109, 6).mover(113, 9, "v");
  L.bricks(117, 120, 8).enemy(118, "f", 5);
  L.mover(124, 7).mover(128, 8, "v").mover(132, 6).bricks(136, 139, 8);
  L.coins(124, 139, 4);
  L.enemy(150, "s").enemy(154, "f", 7).coins(152, 158, 9);
  L.stairUp(162, 4);
  L.flag(170);
  return L.build();
}

function level10() {
  const L = new LevelBuilder(80);
  L.ceil(0, 79);
  L.ground(0, 79);
  L.block(8, 8, "M").block(71, 8, "M");
  L.bricks(20, 24, 7).bricks(55, 59, 7);
  L.coins(20, 24, 5).coins(55, 59, 5);
  L.enemy(55, "K", 11);
  return L.build();
}

export interface LevelDef {
  theme: number;
  map: string[];
  time: number;
  boss?: boolean;
}

export const LEVELS: LevelDef[] = [
  { theme: 0, map: level1(), time: 300 },
  { theme: 1, map: level2(), time: 300 },
  { theme: 2, map: level3(), time: 300 },
  { theme: 3, map: level4(), time: 320 },
  { theme: 4, map: level5(), time: 300 },
  { theme: 5, map: level6(), time: 320 },
  { theme: 6, map: level7(), time: 320 },
  { theme: 7, map: level8(), time: 340 },
  { theme: 8, map: level9(), time: 340 },
  { theme: 9, map: level10(), time: 400, boss: true },
];
