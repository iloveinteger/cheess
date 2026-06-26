export type Color = "white" | "black";
export type PieceType = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";

export interface Square {
  x: number;
  y: number;
}

export interface Piece {
  id: string;
  color: Color;
  type: PieceType;
  hasMoved: boolean;
}

export type Board = Array<Array<Piece | null>>;

export interface LastDoubleStep {
  pawnId: string;
  color: Color;
  from: Square;
  to: Square;
  target: Square;
}

export interface GameState {
  board: Board;
  turn: Color;
  infiniteBishopUsed: Record<Color, boolean>;
  lastDoubleStep: LastDoubleStep | null;
  halfmoveClock: number;
  fullmoveNumber: number;
  nextId: number;
  positionCounts: Record<string, number>;
}

export type Move =
  | {
      kind: "move";
      from: Square;
      to: Square;
    }
  | {
      kind: "promotion";
      from: Square;
      to: Square;
      promoteTo: PieceType;
    }
  | {
      kind: "castle";
      kingFrom: Square;
      rookFrom: Square;
      kingTo: Square;
      rookTo: Square;
    }
  | {
      kind: "enPassant";
      from: Square;
      to: Square;
      captured: Square;
    }
  | {
      kind: "infiniteBishop";
      spawn: Square;
      to: Square;
    }
  | {
      kind: "royalReproduction";
      king: Square;
      queen: Square;
      spawn: Square;
    };

export type GameResult =
  | { status: "active" }
  | { status: "win"; winner: Color; reason: "annihilation" }
  | { status: "draw"; reason: "stalemate" | "threefold repetition" | "fifty-move rule" };

export const BOARD_SIZE = 8;
export const PROMOTION_TYPES: PieceType[] = ["queen", "rook", "bishop", "knight", "king"];

const PIECE_ORDER: PieceType[] = ["king", "queen", "rook", "bishop", "knight", "pawn"];
const ORTHOGONAL: Square[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];
const DIAGONAL: Square[] = [
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 }
];
const KNIGHT_DELTAS: Square[] = [
  { x: 1, y: 2 },
  { x: 2, y: 1 },
  { x: -1, y: 2 },
  { x: -2, y: 1 },
  { x: 1, y: -2 },
  { x: 2, y: -1 },
  { x: -1, y: -2 },
  { x: -2, y: -1 }
];

export function createInitialState(): GameState {
  const board = emptyBoard();
  let nextId = 1;
  const place = (x: number, y: number, color: Color, type: PieceType) => {
    board[y][x] = { id: `${color[0]}${nextId++}`, color, type, hasMoved: false };
  };

  const backRank: PieceType[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  backRank.forEach((type, x) => {
    place(x, 0, "black", type);
    place(x, 7, "white", type);
  });
  for (let x = 0; x < BOARD_SIZE; x += 1) {
    place(x, 1, "black", "pawn");
    place(x, 6, "white", "pawn");
  }

  const state: GameState = {
    board,
    turn: "white",
    infiniteBishopUsed: { white: false, black: false },
    lastDoubleStep: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    nextId,
    positionCounts: {}
  };
  state.positionCounts[repetitionKey(state)] = 1;
  return state;
}

export function getLegalMoves(state: GameState): Move[] {
  const enPassantMoves = generateEnPassantMoves(state);
  if (enPassantMoves.length > 0) {
    return enPassantMoves;
  }

  return [
    ...generatePieceMoves(state),
    ...generateCastlingMoves(state),
    ...generateInfiniteBishopMoves(state),
    ...generateRoyalReproductionMoves(state)
  ];
}

export function applyMove(state: GameState, move: Move): GameState {
  const legalMoves = getLegalMoves(state);
  if (!legalMoves.some((candidate) => sameMove(candidate, move))) {
    throw new Error(`Illegal move: ${describeMove(move)}`);
  }

  const next = cloneState(state);
  const movingColor = state.turn;
  const opponent = opposite(movingColor);
  let capture = false;
  let pawnMove = false;
  next.lastDoubleStep = null;

  if (move.kind === "move" || move.kind === "promotion") {
    const piece = getPiece(next.board, move.from);
    if (!piece) {
      throw new Error("Move source is empty.");
    }
    const target = getPiece(next.board, move.to);
    capture = Boolean(target);
    pawnMove = piece.type === "pawn";
    next.board[move.from.y][move.from.x] = null;
    next.board[move.to.y][move.to.x] = {
      ...piece,
      type: move.kind === "promotion" ? move.promoteTo : piece.type,
      hasMoved:
        move.kind === "promotion" && (move.promoteTo === "king" || move.promoteTo === "rook")
          ? false
          : true
    };

    if (
      piece.type === "pawn" &&
      Math.abs(move.to.y - move.from.y) === 2
    ) {
      next.lastDoubleStep = {
        pawnId: piece.id,
        color: piece.color,
        from: move.from,
        to: move.to,
        target: { x: move.from.x, y: (move.from.y + move.to.y) / 2 }
      };
    }
  }

  if (move.kind === "enPassant") {
    const piece = getPiece(next.board, move.from);
    if (!piece) {
      throw new Error("En passant source is empty.");
    }
    capture = true;
    pawnMove = true;
    next.board[move.from.y][move.from.x] = null;
    next.board[move.captured.y][move.captured.x] = null;
    next.board[move.to.y][move.to.x] = { ...piece, hasMoved: true };
  }

  if (move.kind === "castle") {
    const king = getPiece(next.board, move.kingFrom);
    const rook = getPiece(next.board, move.rookFrom);
    if (!king || !rook) {
      throw new Error("Castling piece is missing.");
    }
    next.board[move.kingFrom.y][move.kingFrom.x] = null;
    next.board[move.rookFrom.y][move.rookFrom.x] = null;
    next.board[move.kingTo.y][move.kingTo.x] = { ...king, hasMoved: true };
    next.board[move.rookTo.y][move.rookTo.x] = { ...rook, hasMoved: true };
  }

  if (move.kind === "infiniteBishop") {
    const target = getPiece(next.board, move.to);
    capture = Boolean(target);
    next.board[move.to.y][move.to.x] = {
      id: `${movingColor[0]}${next.nextId++}`,
      color: movingColor,
      type: "bishop",
      hasMoved: false
    };
    next.infiniteBishopUsed[movingColor] = true;
  }

  if (move.kind === "royalReproduction") {
    next.board[move.spawn.y][move.spawn.x] = {
      id: `${movingColor[0]}${next.nextId++}`,
      color: movingColor,
      type: "pawn",
      hasMoved: false
    };
  }

  next.turn = opponent;
  next.halfmoveClock = capture || pawnMove ? 0 : next.halfmoveClock + 1;
  if (movingColor === "black") {
    next.fullmoveNumber += 1;
  }
  const key = repetitionKey(next);
  next.positionCounts[key] = (next.positionCounts[key] ?? 0) + 1;
  return next;
}

export function detectGameResult(state: GameState): GameResult {
  const whitePieces = getPieces(state, "white").length;
  const blackPieces = getPieces(state, "black").length;

  if (whitePieces === 0 && blackPieces === 0) {
    return { status: "draw", reason: "stalemate" };
  }
  if (whitePieces === 0) {
    return { status: "win", winner: "black", reason: "annihilation" };
  }
  if (blackPieces === 0) {
    return { status: "win", winner: "white", reason: "annihilation" };
  }
  if ((state.positionCounts[repetitionKey(state)] ?? 0) >= 3) {
    return { status: "draw", reason: "threefold repetition" };
  }
  if (state.halfmoveClock >= 100) {
    return { status: "draw", reason: "fifty-move rule" };
  }
  if (getLegalMoves(state).length === 0) {
    return { status: "draw", reason: "stalemate" };
  }

  return { status: "active" };
}

export function serializePosition(state: GameState): string {
  const rows = state.board.map((row) => {
    let empty = 0;
    let output = "";
    for (const piece of row) {
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        output += String(empty);
        empty = 0;
      }
      output += pieceToFenChar(piece);
      output += piece.hasMoved ? "" : "~";
    }
    return output + (empty > 0 ? String(empty) : "");
  });

  const reserve =
    `${state.infiniteBishopUsed.white ? "-" : "WIB"}/` +
    `${state.infiniteBishopUsed.black ? "-" : "BIB"}`;
  const ep = state.lastDoubleStep
    ? squareName(state.lastDoubleStep.target)
    : "-";
  return `${rows.join("/")} ${state.turn[0]} ${reserve} ep:${ep} half:${state.halfmoveClock} full:${state.fullmoveNumber}`;
}

export function generateEnPassantMoves(state: GameState): Move[] {
  const last = state.lastDoubleStep;
  if (!last || last.color === state.turn) {
    return [];
  }

  const moves: Move[] = [];
  const pawns = getPieces(state, state.turn).filter(({ piece }) => piece.type === "pawn");
  for (const { square } of pawns) {
    if (square.y !== last.to.y || Math.abs(square.x - last.to.x) !== 1) {
      continue;
    }
    moves.push({
      kind: "enPassant",
      from: square,
      to: last.target,
      captured: last.to
    });
  }
  return moves;
}

export function generateCastlingMoves(state: GameState): Move[] {
  const ownPieces = getPieces(state, state.turn);
  const kings = ownPieces.filter(({ piece }) => piece.type === "king" && !piece.hasMoved);
  const rooks = ownPieces.filter(({ piece }) => piece.type === "rook" && !piece.hasMoved);
  const moves: Move[] = [];

  for (const king of kings) {
    for (const rook of rooks) {
      const sameRank = king.square.y === rook.square.y;
      const sameFile = king.square.x === rook.square.x;
      if (!sameRank && !sameFile) {
        continue;
      }
      const dx = Math.sign(rook.square.x - king.square.x);
      const dy = Math.sign(rook.square.y - king.square.y);
      const distance = Math.max(
        Math.abs(rook.square.x - king.square.x),
        Math.abs(rook.square.y - king.square.y)
      );
      if (distance < 3) {
        continue;
      }
      if (!isClearLine(state.board, king.square, rook.square)) {
        continue;
      }
      const kingTo = { x: king.square.x + dx * 2, y: king.square.y + dy * 2 };
      const rookTo = { x: king.square.x + dx, y: king.square.y + dy };
      if (
        !inBounds(kingTo) ||
        !inBounds(rookTo) ||
        occupiedByOtherThan(state.board, kingTo, [king.square, rook.square]) ||
        occupiedByOtherThan(state.board, rookTo, [king.square, rook.square])
      ) {
        continue;
      }
      moves.push({
        kind: "castle",
        kingFrom: king.square,
        rookFrom: rook.square,
        kingTo,
        rookTo
      });
    }
  }

  return moves;
}

export function generateInfiniteBishopMoves(state: GameState): Move[] {
  if (state.infiniteBishopUsed[state.turn]) {
    return [];
  }

  const moves: Move[] = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const to = { x, y };
      const target = getPiece(state.board, to);
      if (target?.color === state.turn) {
        continue;
      }
      for (const direction of DIAGONAL) {
        const spawn = bishopSpawnForDestination(state.board, to, direction);
        if (spawn) {
          moves.push({ kind: "infiniteBishop", spawn, to });
        }
      }
    }
  }
  return moves;
}

export function generateRoyalReproductionMoves(state: GameState): Move[] {
  const ownPieces = getPieces(state, state.turn);
  const kings = ownPieces.filter(({ piece }) => piece.type === "king");
  const queens = ownPieces.filter(({ piece }) => piece.type === "queen");
  const moves: Move[] = [];

  for (const king of kings) {
    for (const queen of queens) {
      if (!isAdjacent(king.square, queen.square)) {
        continue;
      }
      for (const delta of [...ORTHOGONAL, ...DIAGONAL]) {
        const spawn = { x: queen.square.x + delta.x, y: queen.square.y + delta.y };
        if (inBounds(spawn) && !getPiece(state.board, spawn)) {
          moves.push({
            kind: "royalReproduction",
            king: king.square,
            queen: queen.square,
            spawn
          });
        }
      }
    }
  }

  return moves;
}

export function generatePromotionMoves(from: Square, to: Square): Move[] {
  return PROMOTION_TYPES.map((promoteTo) => ({
    kind: "promotion",
    from,
    to,
    promoteTo
  }));
}

export function pieceSymbol(piece: Piece): string {
  const symbols: Record<Color, Record<PieceType, string>> = {
    white: {
      king: "♔",
      queen: "♕",
      rook: "♖",
      bishop: "♗",
      knight: "♘",
      pawn: "♙"
    },
    black: {
      king: "♚",
      queen: "♛",
      rook: "♜",
      bishop: "♝",
      knight: "♞",
      pawn: "♟"
    }
  };
  return symbols[piece.color][piece.type];
}

export function squareName(square: Square): string {
  return `${String.fromCharCode(97 + square.x)}${8 - square.y}`;
}

export function parseSquare(name: string): Square | null {
  if (!/^[a-h][1-8]$/.test(name)) {
    return null;
  }
  return {
    x: name.charCodeAt(0) - 97,
    y: 8 - Number(name[1])
  };
}

export function countPieces(state: GameState): Record<Color, Record<PieceType, number>> {
  const counts = {
    white: emptyCounts(),
    black: emptyCounts()
  };
  for (const { piece } of getPieces(state)) {
    counts[piece.color][piece.type] += 1;
  }
  return counts;
}

export function buildStateForTest(
  pieces: Array<{ square: Square; piece: Piece }>,
  turn: Color = "white",
  overrides: Partial<Omit<GameState, "board" | "turn" | "positionCounts">> = {}
): GameState {
  const board = emptyBoard();
  let nextId = 1;
  for (const { square, piece } of pieces) {
    board[square.y][square.x] = piece;
    const numericId = Number(piece.id.replace(/\D/g, ""));
    if (Number.isFinite(numericId)) {
      nextId = Math.max(nextId, numericId + 1);
    }
  }
  const state: GameState = {
    board,
    turn,
    infiniteBishopUsed: { white: false, black: false },
    lastDoubleStep: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    nextId,
    positionCounts: {},
    ...overrides
  };
  state.positionCounts[repetitionKey(state)] = 1;
  return state;
}

function generatePieceMoves(state: GameState): Move[] {
  const moves: Move[] = [];
  for (const { piece, square } of getPieces(state, state.turn)) {
    if (piece.type === "pawn") {
      moves.push(...generatePawnMoves(state.board, piece, square));
    }
    if (piece.type === "knight") {
      moves.push(...generateJumpMoves(state.board, piece, square, KNIGHT_DELTAS));
    }
    if (piece.type === "bishop") {
      moves.push(...generateSlidingMoves(state.board, piece, square, DIAGONAL));
    }
    if (piece.type === "rook") {
      moves.push(...generateSlidingMoves(state.board, piece, square, ORTHOGONAL));
    }
    if (piece.type === "queen") {
      moves.push(...generateSlidingMoves(state.board, piece, square, [...ORTHOGONAL, ...DIAGONAL]));
    }
    if (piece.type === "king") {
      moves.push(...generateJumpMoves(state.board, piece, square, [...ORTHOGONAL, ...DIAGONAL]));
    }
  }
  return moves;
}

function generatePawnMoves(board: Board, piece: Piece, from: Square): Move[] {
  const moves: Move[] = [];
  const direction = piece.color === "white" ? -1 : 1;
  const startRank = piece.color === "white" ? 6 : 1;
  const finalRank = piece.color === "white" ? 0 : 7;
  const one = { x: from.x, y: from.y + direction };
  if (inBounds(one) && !getPiece(board, one)) {
    if (one.y === finalRank) {
      moves.push(...generatePromotionMoves(from, one));
    } else {
      moves.push({ kind: "move", from, to: one });
    }

    const two = { x: from.x, y: from.y + direction * 2 };
    if (!piece.hasMoved && from.y === startRank && inBounds(two) && !getPiece(board, two)) {
      moves.push({ kind: "move", from, to: two });
    }
  }

  for (const dx of [-1, 1]) {
    const to = { x: from.x + dx, y: from.y + direction };
    const target = getPiece(board, to);
    if (!inBounds(to) || !target || target.color === piece.color) {
      continue;
    }
    if (to.y === finalRank) {
      moves.push(...generatePromotionMoves(from, to));
    } else {
      moves.push({ kind: "move", from, to });
    }
  }

  return moves;
}

function generateJumpMoves(board: Board, piece: Piece, from: Square, deltas: Square[]): Move[] {
  const moves: Move[] = [];
  for (const delta of deltas) {
    const to = { x: from.x + delta.x, y: from.y + delta.y };
    if (!inBounds(to)) {
      continue;
    }
    const target = getPiece(board, to);
    if (!target || target.color !== piece.color) {
      moves.push({ kind: "move", from, to });
    }
  }
  return moves;
}

function generateSlidingMoves(board: Board, piece: Piece, from: Square, directions: Square[]): Move[] {
  const moves: Move[] = [];
  for (const direction of directions) {
    let to = { x: from.x + direction.x, y: from.y + direction.y };
    while (inBounds(to)) {
      const target = getPiece(board, to);
      if (!target) {
        moves.push({ kind: "move", from, to });
      } else {
        if (target.color !== piece.color) {
          moves.push({ kind: "move", from, to });
        }
        break;
      }
      to = { x: to.x + direction.x, y: to.y + direction.y };
    }
  }
  return moves;
}

function bishopSpawnForDestination(board: Board, to: Square, direction: Square): Square | null {
  let cursor = { x: to.x + direction.x, y: to.y + direction.y };
  while (inBounds(cursor)) {
    if (getPiece(board, cursor)) {
      return null;
    }
    cursor = { x: cursor.x + direction.x, y: cursor.y + direction.y };
  }
  return cursor;
}

function getPieces(state: GameState, color?: Color): Array<{ piece: Piece; square: Square }> {
  const pieces: Array<{ piece: Piece; square: Square }> = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const piece = state.board[y][x];
      if (piece && (!color || piece.color === color)) {
        pieces.push({ piece, square: { x, y } });
      }
    }
  }
  return pieces;
}

function getPiece(board: Board, square: Square): Piece | null {
  if (!inBounds(square)) {
    return null;
  }
  return board[square.y][square.x];
}

function inBounds(square: Square): boolean {
  return square.x >= 0 && square.x < BOARD_SIZE && square.y >= 0 && square.y < BOARD_SIZE;
}

function opposite(color: Color): Color {
  return color === "white" ? "black" : "white";
}

function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));
}

function cloneState(state: GameState): GameState {
  return {
    board: state.board.map((row) => row.map((piece) => (piece ? { ...piece } : null))),
    turn: state.turn,
    infiniteBishopUsed: { ...state.infiniteBishopUsed },
    lastDoubleStep: state.lastDoubleStep
      ? {
          ...state.lastDoubleStep,
          from: { ...state.lastDoubleStep.from },
          to: { ...state.lastDoubleStep.to },
          target: { ...state.lastDoubleStep.target }
        }
      : null,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    nextId: state.nextId,
    positionCounts: { ...state.positionCounts }
  };
}

function pieceToFenChar(piece: Piece): string {
  const chars: Record<PieceType, string> = {
    king: "k",
    queen: "q",
    rook: "r",
    bishop: "b",
    knight: "n",
    pawn: "p"
  };
  const char = chars[piece.type];
  return piece.color === "white" ? char.toUpperCase() : char;
}

function repetitionKey(state: GameState): string {
  const rows = state.board.map((row) =>
    row
      .map((piece) =>
        piece
          ? `${piece.color[0]}${piece.type[0]}${piece.type === "knight" ? "n" : ""}${piece.hasMoved ? "m" : "u"}`
          : "."
      )
      .join("")
  );
  const ep = state.lastDoubleStep ? squareName(state.lastDoubleStep.target) : "-";
  return `${rows.join("/")}|${state.turn}|${state.infiniteBishopUsed.white}|${state.infiniteBishopUsed.black}|${ep}`;
}

function isClearLine(board: Board, a: Square, b: Square): boolean {
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  let cursor = { x: a.x + dx, y: a.y + dy };
  while (!sameSquare(cursor, b)) {
    if (board[cursor.y][cursor.x]) {
      return false;
    }
    cursor = { x: cursor.x + dx, y: cursor.y + dy };
  }
  return true;
}

function occupiedByOtherThan(board: Board, square: Square, allowed: Square[]): boolean {
  const piece = getPiece(board, square);
  if (!piece) {
    return false;
  }
  return !allowed.some((candidate) => sameSquare(candidate, square));
}

function isAdjacent(a: Square, b: Square): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
}

function sameSquare(a: Square, b: Square): boolean {
  return a.x === b.x && a.y === b.y;
}

function sameMove(a: Move, b: Move): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function describeMove(move: Move): string {
  if (move.kind === "move") return `${squareName(move.from)}-${squareName(move.to)}`;
  if (move.kind === "promotion") return `${squareName(move.from)}-${squareName(move.to)}=${move.promoteTo}`;
  if (move.kind === "castle") return `castle ${squareName(move.kingFrom)} with ${squareName(move.rookFrom)}`;
  if (move.kind === "enPassant") return `en passant ${squareName(move.from)}-${squareName(move.to)}`;
  if (move.kind === "infiniteBishop") return `infinite bishop (${move.spawn.x},${move.spawn.y})->${squareName(move.to)}`;
  return `royal reproduction ${squareName(move.spawn)}`;
}

function emptyCounts(): Record<PieceType, number> {
  return PIECE_ORDER.reduce(
    (counts, type) => ({ ...counts, [type]: 0 }),
    {} as Record<PieceType, number>
  );
}
