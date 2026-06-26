# Meme Chess

A minimalist browser game built with Vite, React, and TypeScript.

Meme Chess starts from the normal chess position, but the objective is total annihilation. Kings are capturable pieces, pawns can promote to kings, en passant is forced, every side has one off-board Infinite Bishop, and adjacent kings and queens can create new pawns.

## Rules

### Objective

A player wins immediately when the opponent has no pieces remaining on the board. The goal is total annihilation, not checkmate.

### Board and Setup

The game uses a normal 8x8 chessboard and the standard chess starting position. Each player also has one Infinite Bishop in reserve. This bishop does not start on the board.

### Standard Movement

Standard chess movement applies unless a rule below changes it.

### Kings

Kings are ordinary capturable pieces.

There is no check, checkmate, or royal safety rule. A king may move into attack, remain in attack, and be captured like any other piece. Capturing a king does not immediately win unless it was the opponent's last remaining piece. A player may have multiple kings.

### Promotion

When a pawn reaches the final rank, it must promote to one of:

- Queen
- Rook
- Bishop
- Knight
- King

A promoted king behaves exactly like any other king.

### Castling

Any king that has never moved may castle with any rook of the same color that has never moved.

Castling is legal when:

- The king has never moved.
- The rook has never moved.
- The king and rook are on the same rank or file.
- Every square between the king and rook is empty.

Because check does not exist, a king may castle out of attack, through attacked squares, or into attack.

Castling rights belong to each individual king and rook. Once a king or rook moves, that piece permanently loses castling rights. Promoted kings and promoted rooks may castle if they have never moved after promotion.

### Forced En Passant

If the current player has at least one legal en passant capture, they must make an en passant capture. While en passant is available, every non-en-passant move is illegal. If multiple en passant captures are available, the player may choose any of them.

### Infinite Bishop

Each player owns one Infinite Bishop in reserve. It may be deployed once per game as that player's move.

To deploy it:

1. Choose any coordinate outside the 8x8 board.
2. From that coordinate, make one bishop move.
3. The move must end on a legal board square.
4. The path must be diagonal and unobstructed once it enters the board.
5. The destination may be empty or occupied by an enemy piece.
6. The destination may not contain a friendly piece.

After deployment, the Infinite Bishop becomes a normal bishop on the board.

### Royal Reproduction

Instead of making a normal move, a player may perform Royal Reproduction.

Requirements:

- The player controls a king and a queen of the same color.
- The chosen king and queen are adjacent horizontally, vertically, or diagonally.
- There is at least one empty square adjacent to the queen.

Effect:

- No existing piece changes square.
- One new pawn of the same color is spawned on an empty square adjacent to the queen.
- The spawned pawn is a normal unmoved pawn.
- The action consumes the player's turn.

### Draws

Stalemate is a draw. A stalemate occurs when the current player has at least one piece but has no legal move.

Threefold repetition is a draw.

The standard fifty-move rule is a draw after 100 halfmoves without a pawn move or capture.

## Implementation

The game engine is separate from the React UI in `src/engine/memeChess.ts`.

Pure engine entry points include:

- `createInitialState()`
- `getLegalMoves(state)`
- `applyMove(state, move)`
- `detectGameResult(state)`
- `serializePosition(state)`

Special rules are implemented as separate functions:

- `generateEnPassantMoves`
- `generateCastlingMoves`
- `generateInfiniteBishopMoves`
- `generateRoyalReproductionMoves`
- `generatePromotionMoves`

The UI uses Unicode chess pieces and displays the current turn, legal move highlights, piece counts, game status, promotion picker, special action controls, forced en passant indicator, undo, restart, and a FEN-like debug serialization.

## Development

Install dependencies:

```bash
npm install
```

Run the validation script:

```bash
npm test
```

Start the local dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Because the repository is named `cheess`, Vite is configured with:

```ts
base: "/cheess/"
```

## GitHub Pages Deployment

This repo includes `.github/workflows/deploy.yml`. On every push to `main`, GitHub Actions installs dependencies, builds the Vite app, uploads `dist`, and deploys it to GitHub Pages.

After pushing, enable Pages in the GitHub web UI:

1. Open the repository on GitHub.
2. Go to **Settings**.
3. Go to **Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Save the setting if GitHub prompts you.

The deployed game will be served under `/cheess/`.
