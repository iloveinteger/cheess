import { useMemo, useState } from "react";
import {
  applyMove,
  countPieces,
  createInitialState,
  detectGameResult,
  generateEnPassantMoves,
  getLegalMoves,
  parseSquare,
  pieceSymbol,
  PROMOTION_TYPES,
  serializePosition,
  squareName,
  type Color,
  type GameState,
  type Move,
  type PieceType,
  type Square
} from "../engine/memeChess";

type Mode = "normal" | "infinite" | "royal";

const PIECE_LABELS: Record<PieceType, string> = {
  king: "King",
  queen: "Queen",
  rook: "Rook",
  bishop: "Bishop",
  knight: "Knight",
  pawn: "Pawn"
};

export function App() {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [mode, setMode] = useState<Mode>("normal");
  const [pendingPromotion, setPendingPromotion] = useState<Move[] | null>(null);

  const legalMoves = useMemo(() => getPlayableMoves(state), [state]);
  const result = useMemo(() => detectGameResult(state), [state]);
  const counts = useMemo(() => countPieces(state), [state]);
  const enPassantForced = generateEnPassantMoves(state).length > 0;

  const selectedMoves = selected ? movesFromSelection(legalMoves, selected) : [];
  const highlightedSquares = highlightedForMode(mode, legalMoves, selectedMoves);

  const playMove = (move: Move) => {
    if (result.status !== "active") {
      return;
    }
    setHistory((current) => [...current, state]);
    setState(applyMove(state, move));
    setSelected(null);
    setMode("normal");
    setPendingPromotion(null);
  };

  const onSquareClick = (square: Square) => {
    if (result.status !== "active") {
      return;
    }

    if (mode === "infinite") {
      const move = legalMoves.find(
        (candidate) => candidate.kind === "infiniteBishop" && sameSquare(candidate.to, square)
      );
      if (move) playMove(move);
      return;
    }

    if (mode === "royal") {
      const move = legalMoves.find(
        (candidate) => candidate.kind === "royalReproduction" && sameSquare(candidate.spawn, square)
      );
      if (move) playMove(move);
      return;
    }

    const destinationMoves = selectedMoves.filter((move) => moveToSquare(move) && sameSquare(moveToSquare(move)!, square));
    if (destinationMoves.length > 0) {
      const promotionMoves = destinationMoves.filter((move) => move.kind === "promotion");
      if (promotionMoves.length > 0) {
        setPendingPromotion(promotionMoves);
      } else {
        playMove(destinationMoves[0]);
      }
      return;
    }

    const piece = state.board[square.y][square.x];
    if (piece?.color === state.turn) {
      setSelected(square);
    } else {
      setSelected(null);
    }
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) {
      return;
    }
    setState(previous);
    setHistory((current) => current.slice(0, -1));
    setSelected(null);
    setMode("normal");
    setPendingPromotion(null);
  };

  const restart = () => {
    setState(createInitialState());
    setHistory([]);
    setSelected(null);
    setMode("normal");
    setPendingPromotion(null);
  };

  const chooseDebugMove = (value: string) => {
    const square = parseSquare(value.trim().toLowerCase());
    if (square) {
      setSelected(square);
      setMode("normal");
    }
  };

  return (
    <main className="app">
      <section className="topbar">
        <div>
          <h1>Meme Chess</h1>
          <p>{statusText(result, state.turn)}</p>
        </div>
        <div className="actions">
          <button type="button" onClick={undo} disabled={history.length === 0}>
            Undo
          </button>
          <button type="button" onClick={restart}>
            Restart
          </button>
        </div>
      </section>

      <section className="game">
        <div className="boardWrap">
          <div className="files topFiles">{["a", "b", "c", "d", "e", "f", "g", "h"].map((file) => <span key={file}>{file}</span>)}</div>
          <div className="boardRow">
            <div className="ranks">{[8, 7, 6, 5, 4, 3, 2, 1].map((rank) => <span key={rank}>{rank}</span>)}</div>
            <div className="board" aria-label="Meme Chess board">
              {state.board.flatMap((row, y) =>
                row.map((piece, x) => {
                  const square = { x, y };
                  const name = squareName(square);
                  const isLight = (x + y) % 2 === 0;
                  const isSelected = selected ? sameSquare(selected, square) : false;
                  const highlight = highlightedSquares.some((candidate) => sameSquare(candidate, square));
                  return (
                    <button
                      key={name}
                      type="button"
                      className={[
                        "square",
                        isLight ? "light" : "dark",
                        isSelected ? "selected" : "",
                        highlight ? "highlight" : ""
                      ].join(" ")}
                      onClick={() => onSquareClick(square)}
                      aria-label={`${name}${piece ? ` ${piece.color} ${piece.type}` : ""}`}
                    >
                      <span className="piece">{piece ? pieceSymbol(piece) : ""}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="ranks rightRanks">{[8, 7, 6, 5, 4, 3, 2, 1].map((rank) => <span key={rank}>{rank}</span>)}</div>
          </div>
          <div className="files">{["a", "b", "c", "d", "e", "f", "g", "h"].map((file) => <span key={file}>{file}</span>)}</div>
        </div>

        <aside className="panel">
          <div className="turn">
            <span className={`dot ${state.turn}`} />
            <strong>{capitalize(state.turn)} to move</strong>
          </div>

          {enPassantForced && <div className="notice">En passant is forced. All other moves are illegal.</div>}

          <div className="specials">
            <button
              type="button"
              className={mode === "infinite" ? "active" : ""}
              onClick={() => setMode(mode === "infinite" ? "normal" : "infinite")}
              disabled={result.status !== "active" || !legalMoves.some((move) => move.kind === "infiniteBishop")}
            >
              Infinite Bishop
            </button>
            <button
              type="button"
              className={mode === "royal" ? "active" : ""}
              onClick={() => setMode(mode === "royal" ? "normal" : "royal")}
              disabled={result.status !== "active" || !legalMoves.some((move) => move.kind === "royalReproduction")}
            >
              Royal Reproduction
            </button>
          </div>

          <div className="counts">
            <PieceCounts color="white" counts={counts.white} />
            <PieceCounts color="black" counts={counts.black} />
          </div>

          <label className="debugSelect">
            Select square
            <input placeholder="e2" maxLength={2} onChange={(event) => chooseDebugMove(event.target.value)} />
          </label>

          <div className="debug">
            <span>Debug serialization</span>
            <code>{serializePosition(state)}</code>
          </div>
        </aside>
      </section>

      {pendingPromotion && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Choose promotion">
          <div className="promotion">
            <h2>Promote pawn</h2>
            <div className="promotionGrid">
              {PROMOTION_TYPES.map((type) => {
                const move = pendingPromotion.find((candidate) => candidate.kind === "promotion" && candidate.promoteTo === type);
                return (
                  <button key={type} type="button" onClick={() => move && playMove(move)} disabled={!move}>
                    {PIECE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function PieceCounts({ color, counts }: { color: Color; counts: Record<PieceType, number> }) {
  return (
    <div className="countGroup">
      <h2>{capitalize(color)}</h2>
      <div className="countGrid">
        {(Object.keys(PIECE_LABELS) as PieceType[]).map((type) => (
          <div key={type}>
            <span>{PIECE_LABELS[type]}</span>
            <strong>{counts[type]}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function getPlayableMoves(state: GameState): Move[] {
  return detectGameResult(state).status === "active" ? getLegalMoves(state) : [];
}

function movesFromSelection(moves: Move[], selected: Square): Move[] {
  return moves.filter((move) => {
    if (move.kind === "move" || move.kind === "promotion" || move.kind === "enPassant") {
      return sameSquare(move.from, selected);
    }
    if (move.kind === "castle") {
      return sameSquare(move.kingFrom, selected) || sameSquare(move.rookFrom, selected);
    }
    return false;
  });
}

function highlightedForMode(mode: Mode, moves: Move[], selectedMoves: Move[]): Square[] {
  if (mode === "infinite") {
    return uniqueSquares(moves.filter((move) => move.kind === "infiniteBishop").map((move) => move.to));
  }
  if (mode === "royal") {
    return uniqueSquares(moves.filter((move) => move.kind === "royalReproduction").map((move) => move.spawn));
  }
  return uniqueSquares(selectedMoves.map(moveToSquare).filter((square): square is Square => Boolean(square)));
}

function moveToSquare(move: Move): Square | null {
  if (move.kind === "move" || move.kind === "promotion" || move.kind === "enPassant") return move.to;
  if (move.kind === "castle") return move.kingTo;
  return null;
}

function uniqueSquares(squares: Square[]): Square[] {
  const seen = new Set<string>();
  return squares.filter((square) => {
    const key = `${square.x},${square.y}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sameSquare(a: Square, b: Square): boolean {
  return a.x === b.x && a.y === b.y;
}

function statusText(result: ReturnType<typeof detectGameResult>, turn: Color): string {
  if (result.status === "active") return `${capitalize(turn)} is choosing a move.`;
  if (result.status === "win") return `${capitalize(result.winner)} wins by annihilation.`;
  return `Draw by ${result.reason}.`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
