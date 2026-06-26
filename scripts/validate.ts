import {
  applyMove,
  buildStateForTest,
  detectGameResult,
  generateCastlingMoves,
  generateInfiniteBishopMoves,
  getLegalMoves,
  type Color,
  type Move,
  type Piece,
  type PieceType,
  type Square
} from "../src/engine/memeChess";

function piece(id: string, color: Color, type: PieceType, hasMoved = false): Piece {
  return { id, color, type, hasMoved };
}

function at(x: number, y: number): Square {
  return { x, y };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function findMove<T extends Move["kind"]>(moves: Move[], kind: T, predicate: (move: Extract<Move, { kind: T }>) => boolean) {
  return moves.find((move): move is Extract<Move, { kind: T }> => move.kind === kind && predicate(move as Extract<Move, { kind: T }>));
}

function forcedEnPassantOverridesNormalMoves() {
  const state = buildStateForTest(
    [
      { square: at(3, 3), piece: piece("w1", "white", "pawn") },
      { square: at(4, 3), piece: piece("b1", "black", "pawn", true) },
      { square: at(7, 7), piece: piece("w2", "white", "rook") },
      { square: at(0, 0), piece: piece("b2", "black", "rook") }
    ],
    "white",
    {
      lastDoubleStep: {
        pawnId: "b1",
        color: "black",
        from: at(4, 1),
        to: at(4, 3),
        target: at(4, 2)
      }
    }
  );
  const moves = getLegalMoves(state);
  assert(moves.length === 1 && moves[0].kind === "enPassant", "forced en passant must override every non-en-passant move");
}

function kingCanBeCaptured() {
  const state = buildStateForTest([
    { square: at(4, 4), piece: piece("w1", "white", "queen") },
    { square: at(4, 0), piece: piece("b1", "black", "king") }
  ]);
  const move = findMove(getLegalMoves(state), "move", (candidate) => candidate.to.x === 4 && candidate.to.y === 0);
  assert(move, "queen should be able to capture a king");
  const next = applyMove(state, move);
  const result = detectGameResult(next);
  assert(result.status === "win" && result.winner === "white", "capturing the last king should win by annihilation");
}

function pawnCanPromoteToKing() {
  const state = buildStateForTest([
    { square: at(0, 1), piece: piece("w1", "white", "pawn") },
    { square: at(7, 0), piece: piece("b1", "black", "rook") }
  ]);
  const move = findMove(getLegalMoves(state), "promotion", (candidate) => candidate.promoteTo === "king");
  assert(move, "pawn must be able to promote to king");
  const next = applyMove(state, move);
  assert(next.board[0][0]?.type === "king", "promotion should create a king");
}

function anyUnmovedKingCanCastleWithUnmovedRook() {
  const state = buildStateForTest([
    { square: at(4, 7), piece: piece("w1", "white", "king") },
    { square: at(0, 7), piece: piece("w2", "white", "rook") },
    { square: at(7, 0), piece: piece("b1", "black", "rook") }
  ]);
  const moves = generateCastlingMoves(state);
  assert(
    moves.some(
      (move) =>
        move.kind === "castle" &&
        move.kingFrom.x === 4 &&
        move.rookFrom.x === 0 &&
        move.kingTo.x === 2 &&
        move.rookTo.x === 3
    ),
    "unmoved king should castle with any clear unmoved rook on the rank"
  );
}

function promotedKingCanCastleWithUnmovedRook() {
  const state = buildStateForTest([
    { square: at(4, 1), piece: piece("w1", "white", "pawn") },
    { square: at(0, 0), piece: piece("w2", "white", "rook") },
    { square: at(7, 7), piece: piece("b1", "black", "rook") }
  ]);
  const promotion = findMove(getLegalMoves(state), "promotion", (candidate) => candidate.promoteTo === "king");
  assert(promotion, "pawn should be able to promote to a king");
  const promoted = applyMove(state, promotion);
  const blackPass = findMove(getLegalMoves(promoted), "move", () => true);
  assert(blackPass, "black should have a pass-through move for this validation");
  const whiteToMove = applyMove(promoted, blackPass);
  const castle = generateCastlingMoves(whiteToMove).find(
    (move) =>
      move.kind === "castle" &&
      move.kingFrom.x === 4 &&
      move.kingFrom.y === 0 &&
      move.rookFrom.x === 0 &&
      move.rookFrom.y === 0
  );
  assert(castle, "a promoted king should retain fresh castling rights until it moves");
}

function promotedRookCanCastleWithUnmovedKing() {
  const state = buildStateForTest([
    { square: at(0, 1), piece: piece("w1", "white", "pawn") },
    { square: at(4, 0), piece: piece("w2", "white", "king") },
    { square: at(7, 7), piece: piece("b1", "black", "rook") }
  ]);
  const promotion = findMove(getLegalMoves(state), "promotion", (candidate) => candidate.promoteTo === "rook");
  assert(promotion, "pawn should be able to promote to a rook");
  const promoted = applyMove(state, promotion);
  assert(promoted.board[0][0]?.type === "rook" && promoted.board[0][0]?.hasMoved === false, "promoted rook should be unmoved");
  const blackPass = findMove(getLegalMoves(promoted), "move", () => true);
  assert(blackPass, "black should have a pass-through move for this validation");
  const whiteToMove = applyMove(promoted, blackPass);
  const castle = generateCastlingMoves(whiteToMove).find(
    (move) =>
      move.kind === "castle" &&
      move.kingFrom.x === 4 &&
      move.kingFrom.y === 0 &&
      move.rookFrom.x === 0 &&
      move.rookFrom.y === 0
  );
  assert(castle, "a promoted rook should retain fresh castling rights until it moves");
}

function unmovedKingCanCastleVerticallyWithUnmovedRook() {
  const state = buildStateForTest([
    { square: at(4, 7), piece: piece("w1", "white", "king") },
    { square: at(4, 3), piece: piece("w2", "white", "rook") },
    { square: at(7, 0), piece: piece("b1", "black", "rook") }
  ]);
  const castle = generateCastlingMoves(state).find(
    (move) =>
      move.kind === "castle" &&
      move.kingFrom.x === 4 &&
      move.kingFrom.y === 7 &&
      move.rookFrom.x === 4 &&
      move.rookFrom.y === 3 &&
      move.kingTo.x === 4 &&
      move.kingTo.y === 5 &&
      move.rookTo.x === 4 &&
      move.rookTo.y === 6
  );
  assert(castle, "unmoved king should castle along a clear file with an unmoved rook");
}

function infiniteBishopDeploysFromOffBoard() {
  const state = buildStateForTest([
    { square: at(0, 7), piece: piece("w1", "white", "rook") },
    { square: at(3, 3), piece: piece("b1", "black", "rook") }
  ]);
  const move = generateInfiniteBishopMoves(state).find(
    (candidate) => candidate.kind === "infiniteBishop" && candidate.to.x === 3 && candidate.to.y === 3
  );
  assert(move, "Infinite Bishop should be able to deploy from off board to a legal target");
  assert(move.kind === "infiniteBishop", "expected an Infinite Bishop move");
  assert(move.spawn.x < 0 || move.spawn.x > 7 || move.spawn.y < 0 || move.spawn.y > 7, "spawn coordinate must be off board");
  const next = applyMove(state, move);
  assert(next.board[3][3]?.type === "bishop" && next.board[3][3]?.color === "white", "Infinite Bishop should become a normal bishop");
}

function royalReproductionSpawnsPawn() {
  const state = buildStateForTest([
    { square: at(4, 4), piece: piece("w1", "white", "king") },
    { square: at(3, 4), piece: piece("w2", "white", "queen") },
    { square: at(7, 0), piece: piece("b1", "black", "rook") }
  ]);
  const move = findMove(getLegalMoves(state), "royalReproduction", (candidate) => candidate.spawn.x === 2 && candidate.spawn.y === 4);
  assert(move, "royal reproduction should offer empty adjacent queen squares");
  const next = applyMove(state, move);
  assert(next.board[4][2]?.type === "pawn" && next.board[4][2]?.color === "white", "royal reproduction should spawn a same-color pawn");
}

function stalemateReturnsDraw() {
  const state = buildStateForTest(
    [
      { square: at(0, 0), piece: piece("w1", "white", "pawn", true) },
      { square: at(7, 7), piece: piece("b1", "black", "pawn", true) }
    ],
    "white",
    { infiniteBishopUsed: { white: true, black: true } }
  );
  const result = detectGameResult(state);
  assert(result.status === "draw" && result.reason === "stalemate", "stalemate should return draw");
}

const tests = [
  forcedEnPassantOverridesNormalMoves,
  kingCanBeCaptured,
  pawnCanPromoteToKing,
  anyUnmovedKingCanCastleWithUnmovedRook,
  promotedKingCanCastleWithUnmovedRook,
  promotedRookCanCastleWithUnmovedKing,
  unmovedKingCanCastleVerticallyWithUnmovedRook,
  infiniteBishopDeploysFromOffBoard,
  royalReproductionSpawnsPawn,
  stalemateReturnsDraw
];

for (const test of tests) {
  test();
  console.log(`ok ${test.name}`);
}
