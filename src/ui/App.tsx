import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
  applyMove,
  countPieces,
  createInitialState,
  detectGameResult,
  generateEnPassantMoves,
  getLegalMoves,
  parseSquare,
  PROMOTION_TYPES,
  serializePosition,
  squareName,
  type Color,
  type GameState,
  type Move,
  type PieceType,
  type Square
} from "../engine/memeChess";

type Mode = "normal" | "infinite";
type GameMode = "local" | "bot" | "analysis";
type BotDifficulty = "easy" | "normal" | "hard";
type AnnotationColor = "yellow" | "red" | "blue" | "green";

interface DragState {
  purpose: "move" | "arrow";
  from: Square;
  pointerId: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  to: Square | null;
  active: boolean;
}

interface ArrowAnnotation {
  id: number;
  from: Square;
  to: Square;
  color: AnnotationColor;
}

interface BishopAnimation {
  id: number;
  from: Square;
  to: Square;
  color: Color;
}

const PIECE_LABELS: Record<PieceType, string> = {
  king: "King",
  queen: "Queen",
  rook: "Rook",
  bishop: "Bishop",
  knight: "Knight",
  pawn: "Pawn"
};

const ANNOTATION_COLORS: AnnotationColor[] = ["yellow", "red", "blue", "green"];
const FILLED_SYMBOLS: Record<PieceType, string> = {
  king: "♚",
  queen: "♛",
  rook: "♜",
  bishop: "♝",
  knight: "♞",
  pawn: "♟"
};

export function App() {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<GameState>(createInitialState());
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [gameMode, setGameMode] = useState<GameMode>("local");
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("normal");
  const [history, setHistory] = useState<GameState[]>([]);
  const [future, setFuture] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [mode, setMode] = useState<Mode>("normal");
  const [pendingPromotion, setPendingPromotion] = useState<Move[] | null>(null);
  const [royalChoices, setRoyalChoices] = useState<Move[] | null>(null);
  const [annotations, setAnnotations] = useState<Record<string, AnnotationColor>>({});
  const [arrows, setArrows] = useState<ArrowAnnotation[]>([]);
  const [lastMoveSquares, setLastMoveSquares] = useState<Square[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [suppressClick, setSuppressClick] = useState(false);
  const [bishopAnimation, setBishopAnimation] = useState<BishopAnimation | null>(null);

  const legalMoves = useMemo(() => getPlayableMoves(state), [state]);
  const result = useMemo(() => detectGameResult(state), [state]);
  const counts = useMemo(() => countPieces(state), [state]);
  const enPassantForced = generateEnPassantMoves(state).length > 0;

  const selectedMoves = selected ? movesFromSelection(legalMoves, selected) : [];
  const royalQueenSquares = selected ? royalQueenTargets(legalMoves, selected) : [];
  const highlightedSquares = highlightedForMode(mode, legalMoves, selectedMoves, royalChoices, royalQueenSquares);
  const canMoveCurrentTurn =
    result.status === "active" &&
    (gameMode !== "bot" || state.turn === "white");
  const analysis = useMemo(() => analyzePosition(state), [state]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (gameMode !== "bot" || state.turn !== "black" || result.status !== "active" || pendingPromotion || royalChoices) {
      return;
    }
    const timer = window.setTimeout(() => {
      const move = chooseBotMove(state, botDifficulty);
      if (move) {
        playMove(move);
      }
    }, 360);
    return () => window.clearTimeout(timer);
  }, [botDifficulty, gameMode, pendingPromotion, result.status, royalChoices, state]);

  const playMove = (move: Move) => {
    if (detectGameResult(stateRef.current).status !== "active") {
      return;
    }
    commitMove(stateRef.current, move);
  };

  const commitMove = (baseState: GameState, move: Move) => {
    const animation =
      move.kind === "infiniteBishop"
        ? {
            id: Date.now(),
            from: move.spawn,
            to: move.to,
            color: baseState.turn
          }
        : null;
    const nextState = applyMove(baseState, move);
    stateRef.current = nextState;
    setHistory((current) => [...current, baseState]);
    setFuture([]);
    setState(nextState);
    setLastMoveSquares(moveSquares(move));
    setSelected(null);
    setMode("normal");
    setPendingPromotion(null);
    setRoyalChoices(null);
    if (animation) {
      setBishopAnimation(animation);
      window.setTimeout(() => {
        setBishopAnimation((current) => (current?.id === animation.id ? null : current));
      }, 760);
    }
  };

  const onSquareClick = (square: Square) => {
    if (suppressClick) {
      setSuppressClick(false);
      return;
    }
    if (royalChoices) {
      const move = royalChoices.find(
        (candidate) => candidate.kind === "royalReproduction" && sameSquare(candidate.spawn, square)
      );
      if (move) {
        playMove(move);
        return;
      }
    }
    if (!canMoveCurrentTurn) return;

    if (mode === "infinite") {
      const move = legalMoves.find(
        (candidate) => candidate.kind === "infiniteBishop" && sameSquare(candidate.to, square)
      );
      if (move) playMove(move);
      return;
    }

    if (royalChoices) setRoyalChoices(null);

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

    if (selected) {
      const royalMoves = royalMovesForQueenDrop(legalMoves, selected, square);
      if (royalMoves.length > 0) {
        setRoyalChoices(royalMoves);
        return;
      }
    }

    const piece = state.board[square.y][square.x];
    if (royalChoices?.some((move) => move.kind === "royalReproduction" && sameSquare(move.spawn, square))) {
      return false;
    }
    if (piece?.color === state.turn) {
      setSelected(square);
      setRoyalChoices(null);
    } else {
      setSelected(null);
      setRoyalChoices(null);
    }
  };

  const playMoveToSquare = (from: Square, to: Square) => {
    if (!canMoveCurrentTurn) {
      return false;
    }
    const royalMoves = royalMovesForQueenDrop(legalMoves, from, to);
    if (royalMoves.length > 0) {
      setSelected(from);
      setRoyalChoices(royalMoves);
      return true;
    }

    const sourceMoves = movesFromSelection(legalMoves, from);
    const destinationMoves = sourceMoves.filter((move) => {
      if (move.kind === "castle") {
        return sameSquare(move.kingTo, to) || sameSquare(move.rookTo, to);
      }
      const destination = moveToSquare(move);
      return destination ? sameSquare(destination, to) : false;
    });

    if (destinationMoves.length === 0) {
      return false;
    }

    const promotionMoves = destinationMoves.filter((move) => move.kind === "promotion");
    if (promotionMoves.length > 0) {
      setSelected(from);
      setPendingPromotion(promotionMoves);
    } else {
      playMove(destinationMoves[0]);
    }
    return true;
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, square: Square) => {
    if (mode !== "normal") {
      return;
    }
    if (event.button === 2) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelected(null);
      setRoyalChoices(null);
      setDrag({
        purpose: "arrow",
        from: square,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        to: square,
        active: false
      });
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const piece = state.board[square.y][square.x];
    const isPlayablePiece = Boolean(piece?.color === state.turn && canMoveCurrentTurn);
    if (!isPlayablePiece) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(square);
    setDrag({
      purpose: "move",
      from: square,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      to: square,
      active: false
    });
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    setDrag((current) => {
      if (!current || current.pointerId !== event.pointerId) {
        return current;
      }
      const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      return {
        ...current,
        x: event.clientX,
        y: event.clientY,
        to: squareFromClientPoint(event.clientX, event.clientY),
        active: current.active || distance > 5
      };
    });
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const drop = squareFromClientPoint(event.clientX, event.clientY);
    const wasActive = drag.active || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
    setDrag(null);
    if (wasActive) {
      setSuppressClick(true);
      if (drop && drag.purpose === "move") {
        playMoveToSquare(drag.from, drop);
      } else if (drop && drag.purpose === "arrow" && !sameSquare(drag.from, drop)) {
        toggleArrow(drag.from, drop);
      }
    } else if (drag.purpose === "arrow") {
      cycleAnnotation(drag.from);
    }
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) {
      return;
    }
    setFuture((current) => [stateRef.current, ...current]);
    stateRef.current = previous;
    setState(previous);
    setHistory((current) => current.slice(0, -1));
    setSelected(null);
    setMode("normal");
    setPendingPromotion(null);
    setRoyalChoices(null);
    setLastMoveSquares([]);
    setBishopAnimation(null);
  };

  const redo = () => {
    const next = future[0];
    if (!next) {
      return;
    }
    setHistory((current) => [...current, stateRef.current]);
    stateRef.current = next;
    setState(next);
    setFuture((current) => current.slice(1));
    setSelected(null);
    setMode("normal");
    setPendingPromotion(null);
    setRoyalChoices(null);
    setLastMoveSquares([]);
    setBishopAnimation(null);
  };

  const restart = () => {
    const freshState = createInitialState();
    stateRef.current = freshState;
    setState(freshState);
    setHistory([]);
    setFuture([]);
    setSelected(null);
    setMode("normal");
    setPendingPromotion(null);
    setRoyalChoices(null);
    setAnnotations({});
    setArrows([]);
    setLastMoveSquares([]);
    setBishopAnimation(null);
  };

  const chooseDebugMove = (value: string) => {
    const square = parseSquare(value.trim().toLowerCase());
    if (square) {
      setSelected(square);
      setMode("normal");
      setRoyalChoices(null);
    }
  };

  const cycleAnnotation = (square: Square) => {
    const key = squareKey(square);
    setAnnotations((current) => {
      const existing = current[key];
      const nextIndex = existing ? ANNOTATION_COLORS.indexOf(existing) + 1 : 0;
      const copy = { ...current };
      if (nextIndex >= ANNOTATION_COLORS.length) {
        delete copy[key];
      } else {
        copy[key] = ANNOTATION_COLORS[nextIndex];
      }
      return copy;
    });
  };

  const toggleArrow = (from: Square, to: Square) => {
    setArrows((current) => {
      const existing = current.find((arrow) => sameSquare(arrow.from, from) && sameSquare(arrow.to, to));
      if (existing) {
        return current.filter((arrow) => arrow.id !== existing.id);
      }
      return [...current, { id: Date.now(), from, to, color: "yellow" }];
    });
  };

  const switchGameMode = (nextMode: GameMode) => {
    setGameMode(nextMode);
    restart();
  };

  return (
    <main className="app">
      <section className="topbar">
        <div>
          <h1>Meme Chess</h1>
          <p>{statusText(result, state.turn)}</p>
        </div>
        <div className="actions">
          <button type="button" className={gameMode === "local" ? "active" : ""} onClick={() => switchGameMode("local")}>
            Local
          </button>
          <button type="button" className={gameMode === "bot" ? "active" : ""} onClick={() => switchGameMode("bot")}>
            Vs Bot
          </button>
          <button type="button" className={gameMode === "analysis" ? "active" : ""} onClick={() => switchGameMode("analysis")}>
            Analysis
          </button>
          {gameMode === "bot" && (
            <label className="difficulty">
              Difficulty
              <select value={botDifficulty} onChange={(event) => setBotDifficulty(event.target.value as BotDifficulty)}>
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          )}
          <button type="button" onClick={undo} disabled={history.length === 0}>
            Undo
          </button>
          <button type="button" onClick={redo} disabled={gameMode !== "analysis" || future.length === 0}>
            Redo
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
            <div className="board" ref={boardRef} onContextMenu={(event) => event.preventDefault()} aria-label="Meme Chess board">
              {state.board.flatMap((row, y) =>
                row.map((piece, x) => {
                  const square = { x, y };
                  const name = squareName(square);
                  const isLight = (x + y) % 2 === 0;
                  const isSelected = selected ? sameSquare(selected, square) : false;
                  const marker = markerForSquare(
                    square,
                    highlightedSquares,
                    mode,
                    selectedMoves,
                    Boolean(piece),
                    royalChoices,
                    royalQueenSquares
                  );
                  const isLastMove = lastMoveSquares.some((candidate) => sameSquare(candidate, square));
                  const isDraggedPiece = Boolean(drag?.active && sameSquare(drag.from, square));
                  const annotation = annotations[squareKey(square)];
                  return (
                    <button
                      key={name}
                      type="button"
                      className={[
                        "square",
                        isLight ? "light" : "dark",
                        isSelected ? "selected" : "",
                        isLastMove ? "lastMove" : "",
                        marker ? `marker-${marker}` : "",
                        annotation ? `annotation-${annotation}` : "",
                        isDraggedPiece ? "dragSource" : ""
                      ].join(" ")}
                      onPointerDown={(event) => onPointerDown(event, square)}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={() => setDrag(null)}
                      onClick={() => onSquareClick(square)}
                      aria-label={`${name}${piece ? ` ${piece.color} ${piece.type}` : ""}`}
                    >
                      <span className={piece ? `piece ${piece.color}` : "piece"}>
                        {piece ? filledPieceSymbol(piece.type) : ""}
                      </span>
                    </button>
                  );
                })
              )}
              <svg className="arrowLayer" viewBox="0 0 100 100" aria-hidden="true">
                <defs>
                  <marker
                    id="arrowHead"
                    markerWidth="4"
                    markerHeight="4"
                    refX="3.4"
                    refY="2"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d="M0,0 L4,2 L0,4 Z" />
                  </marker>
                </defs>
                {[...arrows, ...previewArrows(drag)].map((arrow) => {
                  const line = arrowLine(arrow.from, arrow.to);
                  return (
                    <line
                      key={arrow.id}
                      className={`boardArrow arrow-${arrow.color}`}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      markerEnd="url(#arrowHead)"
                    />
                  );
                })}
              </svg>
              {bishopAnimation && (
                <span
                  key={bishopAnimation.id}
                  className={`infiniteBishopFlight ${bishopAnimation.color}`}
                  style={bishopFlightStyle(bishopAnimation)}
                  aria-hidden="true"
                >
                  {filledPieceSymbol("bishop")}
                </span>
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
            <button type="button" onClick={() => setAnnotations({})} disabled={Object.keys(annotations).length === 0}>
              Clear Marks
            </button>
            <button type="button" onClick={() => setArrows([])} disabled={arrows.length === 0}>
              Clear Arrows
            </button>
          </div>

          {gameMode === "analysis" && (
            <div className="analysisPanel">
              <div className="evalBar" aria-label={`Evaluation ${formatEvaluation(analysis.score)}`}>
                <div className="evalBlack" style={{ height: `${100 - analysis.whitePercent}%` }} />
                <div className="evalLabel">{formatEvaluation(analysis.score)}</div>
              </div>
              <div className="recommendation">
                <span>Recommended</span>
                <strong>{analysis.bestMove ? describeMoveLabel(analysis.bestMove) : "No legal move"}</strong>
              </div>
            </div>
          )}

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

      {drag?.active && drag.purpose === "move" && (
        <div className={`dragPiece ${state.board[drag.from.y][drag.from.x]!.color}`} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {filledPieceSymbol(state.board[drag.from.y][drag.from.x]!.type)}
        </div>
      )}
    </main>
  );

  function squareFromClientPoint(clientX: number, clientY: number): Square | null {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }
    return {
      x: Math.min(7, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 8))),
      y: Math.min(7, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * 8)))
    };
  }
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

function highlightedForMode(
  mode: Mode,
  moves: Move[],
  selectedMoves: Move[],
  royalChoices: Move[] | null,
  royalQueenSquares: Square[]
): Square[] {
  if (royalChoices) {
    return uniqueSquares(
      royalChoices
        .filter((move) => move.kind === "royalReproduction")
        .map((move) => move.spawn)
    );
  }
  if (mode === "infinite") {
    return uniqueSquares(moves.filter((move) => move.kind === "infiniteBishop").map((move) => move.to));
  }
  return uniqueSquares([
    ...selectedMoves.map(moveToSquare).filter((square): square is Square => Boolean(square)),
    ...royalQueenSquares
  ]);
}

function moveToSquare(move: Move): Square | null {
  if (move.kind === "move" || move.kind === "promotion" || move.kind === "enPassant") return move.to;
  if (move.kind === "castle") return move.kingTo;
  return null;
}

function moveSquares(move: Move): Square[] {
  if (move.kind === "move" || move.kind === "promotion") return [move.from, move.to];
  if (move.kind === "enPassant") return [move.from, move.to, move.captured];
  if (move.kind === "castle") return [move.kingFrom, move.kingTo, move.rookFrom, move.rookTo];
  if (move.kind === "infiniteBishop") return [move.to];
  return [move.king, move.queen, move.spawn];
}

function markerForSquare(
  square: Square,
  highlightedSquares: Square[],
  mode: Mode,
  selectedMoves: Move[],
  occupied: boolean,
  royalChoices: Move[] | null,
  royalQueenSquares: Square[]
): "move" | "capture" | "special" | null {
  if (!highlightedSquares.some((candidate) => sameSquare(candidate, square))) {
    return null;
  }
  if (
    mode === "infinite" ||
    royalQueenSquares.some((candidate) => sameSquare(candidate, square)) ||
    royalChoices?.some((move) => move.kind === "royalReproduction" && sameSquare(move.spawn, square))
  ) {
    return "special";
  }
  const move = selectedMoves.find((candidate) => {
    const destination = moveToSquare(candidate);
    return destination ? sameSquare(destination, square) : false;
  });
  if (!move) {
    return "move";
  }
  if (move.kind === "enPassant") {
    return "capture";
  }
  if (move.kind === "move" || move.kind === "promotion") {
    return occupied ? "capture" : "move";
  }
  return "move";
}

function royalQueenTargets(moves: Move[], king: Square): Square[] {
  return uniqueSquares(
    moves
      .filter((move) => move.kind === "royalReproduction" && sameSquare(move.king, king))
      .map((move) => (move.kind === "royalReproduction" ? move.queen : { x: -1, y: -1 }))
  );
}

function royalMovesForQueenDrop(moves: Move[], king: Square, queen: Square): Move[] {
  return moves.filter(
    (move) =>
      move.kind === "royalReproduction" &&
      sameSquare(move.king, king) &&
      sameSquare(move.queen, queen)
  );
}

function filledPieceSymbol(type: PieceType): string {
  return FILLED_SYMBOLS[type];
}

function squareKey(square: Square): string {
  return `${square.x},${square.y}`;
}

function previewArrows(drag: DragState | null): ArrowAnnotation[] {
  if (!drag || drag.purpose !== "arrow" || !drag.active || !drag.to || sameSquare(drag.from, drag.to)) {
    return [];
  }
  return [{ id: -1, from: drag.from, to: drag.to, color: "yellow" }];
}

function arrowLine(from: Square, to: Square) {
  const start = boardPoint(from);
  const end = boardPoint(to);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const shorten = 3.6;
  return {
    x1: start.x + (dx / length) * shorten,
    y1: start.y + (dy / length) * shorten,
    x2: end.x - (dx / length) * shorten,
    y2: end.y - (dy / length) * shorten
  };
}

function boardPoint(square: Square) {
  return {
    x: (square.x + 0.5) * 12.5,
    y: (square.y + 0.5) * 12.5
  };
}

function chooseBotMove(state: GameState, difficulty: BotDifficulty = "hard"): Move | null {
  const moves = getLegalMoves(state);
  if (moves.length === 0) {
    return null;
  }

  if (difficulty === "easy") {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  if (difficulty === "normal") {
    return moves
      .map((move) => ({ move, score: scoreBotMove(state, move) + Math.random() * 80 }))
      .sort((a, b) => b.score - a.score)[0].move;
  }

  return chooseSearchMove(state);
}

function analyzePosition(state: GameState) {
  const score = evaluatePosition(state);
  return {
    score,
    whitePercent: Math.max(6, Math.min(94, 50 + score / 40)),
    bestMove: chooseBotMove(state, "hard")
  };
}

function evaluatePosition(state: GameState): number {
  let score = 0;
  for (const row of state.board) {
    for (const piece of row) {
      if (!piece) continue;
      score += (piece.color === "white" ? 1 : -1) * pieceValue(piece.type);
    }
  }
  return score;
}

function scoreBotMove(state: GameState, move: Move): number {
  let score = 0;
  const result = detectGameResult(applyMove(state, move));
  if (result.status === "win") score += 10000;
  if (move.kind === "promotion") score += move.promoteTo === "queen" ? 900 : move.promoteTo === "king" ? 500 : 300;
  if (move.kind === "enPassant") score += 220;
  if (move.kind === "infiniteBishop") score += state.board[move.to.y][move.to.x] ? 360 : 30;
  if (move.kind === "move" || move.kind === "promotion") {
    const target = state.board[move.to.y][move.to.x];
    if (target) score += pieceValue(target.type);
  }
  if (move.kind === "royalReproduction") score += 120;
  return score;
}

function chooseSearchMove(state: GameState): Move {
  const moves = getLegalMoves(state);
  const maximizing = state.turn === "white";
  const candidates = [...moves]
    .sort((a, b) => scoreBotMove(state, b) - scoreBotMove(state, a))
    .slice(0, 24);

  return candidates
    .map((move) => ({
      move,
      score: minimax(applyMove(state, move), 1)
    }))
    .sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score))[0].move;
}

function minimax(state: GameState, depth: number): number {
  const result = detectGameResult(state);
  if (result.status === "win") {
    return result.winner === "white" ? 100000 : -100000;
  }
  if (result.status === "draw" || depth === 0) {
    return evaluatePosition(state);
  }

  const moves = getLegalMoves(state)
    .sort((a, b) => scoreBotMove(state, b) - scoreBotMove(state, a))
    .slice(0, 24);
  const scores = moves.map((move) => minimax(applyMove(state, move), depth - 1));
  return state.turn === "white" ? Math.max(...scores) : Math.min(...scores);
}

function pieceValue(type: PieceType): number {
  if (type === "queen") return 900;
  if (type === "rook") return 500;
  if (type === "bishop" || type === "knight") return 300;
  if (type === "king") return 250;
  return 100;
}

function formatEvaluation(score: number): string {
  if (score === 0) return "0.0";
  const sign = score > 0 ? "+" : "-";
  return `${sign}${(Math.abs(score) / 100).toFixed(1)}`;
}

function describeMoveLabel(move: Move): string {
  if (move.kind === "move") return `${squareName(move.from)}-${squareName(move.to)}`;
  if (move.kind === "promotion") return `${squareName(move.from)}-${squareName(move.to)}=${move.promoteTo}`;
  if (move.kind === "castle") return `${squareName(move.kingFrom)}-${squareName(move.kingTo)} castle`;
  if (move.kind === "enPassant") return `${squareName(move.from)}-${squareName(move.to)} e.p.`;
  if (move.kind === "infiniteBishop") return `IB ${squareName(move.to)}`;
  return `RR ${squareName(move.spawn)}`;
}

function bishopFlightStyle(animation: BishopAnimation): CSSProperties {
  const targetX = (animation.to.x + 0.5) * 12.5;
  const targetY = (animation.to.y + 0.5) * 12.5;
  const startX = (animation.from.x + 0.5) * 12.5;
  const startY = (animation.from.y + 0.5) * 12.5;

  return {
    "--flight-start-x": `${startX}%`,
    "--flight-start-y": `${startY}%`,
    "--flight-end-x": `${targetX}%`,
    "--flight-end-y": `${targetY}%`
  } as CSSProperties;
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
