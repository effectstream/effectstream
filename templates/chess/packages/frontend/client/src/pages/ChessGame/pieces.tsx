import React from "react";

import whitePawn from "../../../assets/images/pieces/whitePawn.svg";
import whiteRook from "../../../assets/images/pieces/whiteRook.svg";
import whiteKnight from "../../../assets/images/pieces/whiteKnight.svg";
import whiteBishop from "../../../assets/images/pieces/whiteBishop.svg";
import whiteQueen from "../../../assets/images/pieces/whiteQueen.svg";
import whiteKing from "../../../assets/images/pieces/whiteKing.svg";

import blackPawn from "../../../assets/images/pieces/blackPawn.svg";
import blackRook from "../../../assets/images/pieces/blackRook.svg";
import blackKnight from "../../../assets/images/pieces/blackKnight.svg";
import blackBishop from "../../../assets/images/pieces/blackBishop.svg";
import blackQueen from "../../../assets/images/pieces/blackQueen.svg";
import blackKing from "../../../assets/images/pieces/blackKing.svg";
import type { CustomPieceFn } from "react-chessboard/dist/chessboard/types";

// Inspired by https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces

export const chessPieces: Record<string, CustomPieceFn> = {
  wP: ({ squareWidth }) => <img src={whitePawn} height={squareWidth} />,
  wR: ({ squareWidth }) => <img src={whiteRook} height={squareWidth} />,
  wN: ({ squareWidth }) => <img src={whiteKnight} height={squareWidth} />,
  wB: ({ squareWidth }) => <img src={whiteBishop} height={squareWidth} />,
  wQ: ({ squareWidth }) => <img src={whiteQueen} height={squareWidth} />,
  wK: ({ squareWidth }) => <img src={whiteKing} height={squareWidth} />,

  bP: ({ squareWidth }) => <img src={blackPawn} height={squareWidth} />,
  bR: ({ squareWidth }) => <img src={blackRook} height={squareWidth} />,
  bN: ({ squareWidth }) => <img src={blackKnight} height={squareWidth} />,
  bB: ({ squareWidth }) => <img src={blackBishop} height={squareWidth} />,
  bQ: ({ squareWidth }) => <img src={blackQueen} height={squareWidth} />,
  bK: ({ squareWidth }) => <img src={blackKing} height={squareWidth} />,
};

export enum ChessPiece {
  PAWN = "p",
  ROOK = "r",
  KNIGHT = "n",
  BISHOP = "b",
  QUEEN = "q",
  KING = "k",
}
