import React, { Ref, useEffect, useMemo, useRef, useState } from "react";
import "./DiceGame.scss";
import { Box, Typography } from "@mui/material";
import {
  type MatchState,
  type TickEvent,
  type LobbyState,
  TickEventKind,
  LobbyPlayer,
} from "@dice/utils";
import {
  applyEvent,
  getPlayerScore,
  cloneMatchState,
} from "@dice/game-logic";
import * as Paima from "@dice/middleware";
import { DiceService } from "./GameLogic";
import { RoundExecutorWrapper } from "./RoundExecutorWrapper";
import Player from "./Player";
import { DiceRef } from "./Dice";

interface DiceGameProps {
  lobbyState: LobbyState;
  refetchLobbyState: () => Promise<void>;
  selectedNft: number;
}

const DiceGame: React.FC<DiceGameProps> = ({
  lobbyState,
  refetchLobbyState,
  selectedNft,
}) => {
  const diceRefs = useRef<Record<number, undefined | DiceRef>>({});
  const [matchOver, setMatchOver] = useState(false);
  const [caption, setCaption] = useState<undefined | string>();

  // round being currently shown
  // interactive if this player's round,
  // passive replay if other player's round
  const [displayedRound, setDisplayedRound] = useState<number>(0);
  // end state of last round (latest finished round)
  const [displayedState, setDisplayedState] = useState<MatchState>({
    turn: lobbyState.current_turn,
    properRound: lobbyState.current_proper_round,
    players: lobbyState.players,
    result: undefined,
  });
  // cache of state that was fetched, but still needs to be displayed
  // the actual round executor is stateful so we store all it's end results instead
  const [roundExecutor, setRoundExecutor] = useState<
    | undefined
    | {
        tickEvents: TickEvent[];
        endState: MatchState;
      }
  >();
  const [isTickDisplaying, setIsTickDisplaying] = useState(false);

  const thisPlayer = useMemo(() => {
    const result = lobbyState.players.find(
      (player) => player.nftId === selectedNft
    );
    if (result == null) throw new Error(`DiceGame: nft not in lobby`);
    return result;
  }, [lobbyState, selectedNft]);

  // Update displayedState when lobby state changes (e.g., when second player joins)
  // Only update players if they're structurally different (e.g., new player joined)
  // Update turn/properRound/displayedRound when game starts, but not during active gameplay
  useEffect(() => {
    setDisplayedState((prev) => {
      // Only update players if the number of players changed or NFT IDs changed
      const playersChanged =
        prev.players.length !== lobbyState.players.length ||
        prev.players.some((p, i) => p.nftId !== lobbyState.players[i]?.nftId);

      // Only update turn/properRound when transitioning from null (game starting)
      // Once gameplay begins, the round executor handles these updates
      const gameJustStarted = prev.turn == null && lobbyState.current_turn != null;

      // Also update displayedRound and nextFetchedRound when game starts
      if (gameJustStarted && lobbyState.current_round != null) {
        setDisplayedRound(0); // Always start displaying from round 0
        setFetchedRound(0);   // Always start fetching from round 0
      }

      return {
        ...prev,
        turn: gameJustStarted ? lobbyState.current_turn : prev.turn,
        properRound: gameJustStarted ? lobbyState.current_proper_round : prev.properRound,
        players: playersChanged ? lobbyState.players : prev.players,
      };
    });

    // Also update fetchedEndState when lobby state changes (players, turn, properRound)
    setFetchedEndState((prev: MatchState) => {
      const playersChanged =
        prev.players.length !== lobbyState.players.length ||
        prev.players.some((p: any, i: number) => p.nftId !== lobbyState.players[i]?.nftId);

      // When game starts (turn changes from null to a number), update turn and properRound
      const gameJustStarted = prev.turn == null && lobbyState.current_turn != null;

      if (playersChanged || gameJustStarted) {
        return {
          ...prev,
          players: lobbyState.players,
          turn: gameJustStarted ? lobbyState.current_turn : prev.turn,
          properRound: gameJustStarted ? lobbyState.current_proper_round : prev.properRound,
        };
      }

      return prev;
    });
  }, [lobbyState.current_turn, lobbyState.current_proper_round, lobbyState.current_round, lobbyState.players]);

  async function submit(rollAgain: boolean) {
    const moveResult = await DiceService.submitMove(
      selectedNft,
      lobbyState,
      rollAgain
    );
    console.log("Move result:", moveResult);
    await refetchLobbyState();
  }

  async function handleRoll(): Promise<void> {
    console.log(`[DiceGame] User clicked ROLL, submitting move with roll_again=true`);
    submit(true);
  }

  async function handlePass(): Promise<void> {
    console.log(`[DiceGame] User clicked PASS, submitting move with roll_again=false`);
    submit(false);
  }

  useEffect(() => {
    // past turn animation (mostly opponents' turns)

    if (
      isTickDisplaying ||
      roundExecutor == null
    )
      return;

    void (async () => {
      setIsTickDisplaying(true);

      const tickEvents = roundExecutor.tickEvents;

      console.log(`[DiceGame] Playing ${tickEvents.length} tick events for round ${displayedRound}`);
      console.log(`[DiceGame] This player turn: ${thisPlayer.turn}, displayed turn: ${displayedState.turn}`);

      // Track state as we process events
      let currentState = cloneMatchState(displayedState);

      for (const tickEvent of tickEvents) {
        if (tickEvent.kind === TickEventKind.roll) {
          const diceRef = diceRefs.current[currentState.turn];
          console.log(`[DiceGame] Rolling dice for turn ${currentState.turn}:`, tickEvent.diceRolls, `diceRef available: ${diceRef != null}`);
          if (diceRef) {
            await diceRef.roll(tickEvent.diceRolls);
          } else {
            console.warn(`[DiceGame] Dice ref not available for turn ${currentState.turn}, skipping animation`);
          }
        }

        // Apply event to our local state
        applyEvent(currentState, tickEvent);

        if (tickEvent.kind === TickEventKind.roll)
          await new Promise((resolve) => setTimeout(resolve, 2000));

        if (tickEvent.kind === TickEventKind.applyPoints) {
          setCaption(
            (() => {
              const thisPlayerIndex = currentState.players.findIndex(
                (player) => player.nftId === selectedNft
              );

              const you = tickEvent.points[thisPlayerIndex];
              const opponents = tickEvent.points.filter(
                (_, i) => i !== thisPlayerIndex
              );

              // New game rules: lower score wins, winner gets 1 point
              if (you === 1) return "You win this round! +1 point";
              if (opponents.some((points) => points === 1))
                return "You lose this round. Opponent gets +1 point";
              return "Round tied - no points awarded";
            })()
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));
          setCaption(undefined);
        }

        if (tickEvent.kind === TickEventKind.matchEnd) {
          setCaption(() => {
            const thisPlayerIndex = currentState.players.findIndex(
              (player) => player.nftId === selectedNft
            );
            const thisPlayerResult = tickEvent.result[thisPlayerIndex];

            // New game rules: lowest total points wins the match
            if (thisPlayerResult === "w") return "🎉 You win the match!";
            if (thisPlayerResult === "l") return "You lose the match";
            return "Match tied!";
          });
          setMatchOver(true);
        }
      }

      // Check if round actually completed (has roundEnd event)
      const roundCompleted = tickEvents.some(e => e.kind === TickEventKind.roundEnd);

      console.log(`[DiceGame] Ticks complete for round ${displayedRound}. Round completed: ${roundCompleted}, had ${tickEvents.length} events`);

      if (roundCompleted) {
        setDisplayedRound(displayedRound + 1);
      }

      // Update displayed state with the final state after processing all events
      if (tickEvents.length > 0) {
        setDisplayedState(currentState);
      }

      setIsTickDisplaying(false);
      setRoundExecutor(undefined);
    })();
  }, [isTickDisplaying, roundExecutor]);

  const [isFetchingRound, setIsFetchingRound] = useState(false);
  const [fetchedEndState, setFetchedEndState] = useState<MatchState>({
    turn: lobbyState.current_turn,
    properRound: lobbyState.current_proper_round,
    players: lobbyState.players,
    result: undefined,
  });
  const [nextFetchedRound, setFetchedRound] = useState(0);

  useEffect(() => {
    // fetch new round data
    console.log(`[DiceGame] Fetch check: displayedRound=${displayedRound}, nextFetchedRound=${nextFetchedRound}, current_round=${lobbyState.current_round}, hasExecutor=${roundExecutor != null}, isFetching=${isFetchingRound}`);

    if (
      // we're up-to-date
      nextFetchedRound >= lobbyState.current_round ||
      // we already fetched a round
      roundExecutor != null ||
      // we're currently fetching
      isFetchingRound
    )
      return;

    console.log(`[DiceGame] Fetching round ${nextFetchedRound}, fetchedEndState:`, {
      turn: fetchedEndState.turn,
      properRound: fetchedEndState.properRound,
      players: fetchedEndState.players.map((p: any) => ({ nftId: p.nftId, turn: p.turn, score: p.score, points: p.points }))
    });
    setIsFetchingRound(true);
    Paima.default
      .getRoundExecutor(
        lobbyState.lobby_id,
        lobbyState.current_match,
        nextFetchedRound,
        fetchedEndState
      )
      .then((newRoundExecutor) => {
        if (newRoundExecutor.success) {
          // Wrap the result in RoundExecutorWrapper
          const wrapper = new RoundExecutorWrapper(
            newRoundExecutor.result.moves,
            newRoundExecutor.result.lobbyData,
            newRoundExecutor.result.initialMatchState
          );

          const newRoundExecutorResults = {
            tickEvents: wrapper.processAllTicks(),
            endState: wrapper.endState(),
          };

          console.log(`[DiceGame] Fetched round ${nextFetchedRound} with ${newRoundExecutor.result.moves.length} moves, ${newRoundExecutorResults.tickEvents.length} tick events`);

          setRoundExecutor(newRoundExecutorResults);
          setFetchedRound(nextFetchedRound + 1);
          // Merge players: use endState players (with updated scores), but add any new players from lobbyState
          const endStatePlayers = newRoundExecutorResults.endState.players;
          const lobbyPlayers = lobbyState.players;
          const mergedPlayers = [
            ...endStatePlayers,
            // Add any players from lobby that aren't in endState (players who joined after round started)
            ...lobbyPlayers.filter((lp: any) => !endStatePlayers.some((ep: any) => ep.nftId === lp.nftId))
          ];
          setFetchedEndState({
            ...newRoundExecutorResults.endState,
            players: mergedPlayers,
          });
          setIsFetchingRound(false);
        } else {
          console.error(
            `Failed to fetch round executor: ${
              newRoundExecutor.success === false &&
              newRoundExecutor.errorMessage
            }`
          );
          // delay refetch of fail
          setTimeout(() => {
            setIsFetchingRound(false);
          }, 1000);
        }
      });
  }, [isFetchingRound, displayedRound, lobbyState.current_round, roundExecutor]);

  const disableInteraction =
    matchOver ||
    thisPlayer.turn !== displayedState.turn ||
    isTickDisplaying;

  // Safety check: ensure displayedState has a valid turn player
  const turnPlayerExists = displayedState.players.some(p => p.turn === displayedState.turn);

  // New game rules: Roll any time, Pass any time
  const canRoll = !disableInteraction && turnPlayerExists;
  const canPass = !disableInteraction && turnPlayerExists;

  if (lobbyState == null) return <></>;

  // Check if this player is actually in the lobby
  const playerInLobby = lobbyState.players.some(
    (player) => player.nftId === selectedNft
  );

  if (!playerInLobby) {
    return (
      <Box sx={{ textAlign: "center", padding: 4 }}>
        <Typography variant="h5" sx={{ marginBottom: 2 }}>
          Joining lobby...
        </Typography>
        <Typography variant="body1">
          Please wait while your join request is being processed.
        </Typography>
      </Box>
    );
  }

  // Check if the match has started (lobby is active with match/round data AND has enough players)
  if (lobbyState.current_match == null || lobbyState.current_round == null || lobbyState.players.length < 2) {
    return (
      <Box sx={{ textAlign: "center", padding: 4 }}>
        <Typography variant="h5" sx={{ marginBottom: 2 }}>
          Waiting for opponent...
        </Typography>
        <Typography variant="body1">
          The game will start when another player joins the lobby.
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Typography
        variant="caption"
        sx={{ fontSize: "1.25rem", lineHeight: "1.75rem" }}
      >
        {matchOver ? "Match over" : `Round: ${displayedState.properRound + 1}`}
        {" | "}
        {caption ??
          (thisPlayer.turn === displayedState.turn
            ? "Your turn"
            : "Opponent's turn")}
      </Typography>
      <Box
        sx={{
          width: "100%",
          display: "flex",
          gap: 5,
        }}
      >
        {displayedState.players.map((player) => (
          <Player
            key={`player-${player.nftId}`}
            lobbyPlayer={player}
            thisClientPlayer={thisPlayer.nftId}
            turn={displayedState.turn}
            diceRef={(elem) => {
              diceRefs.current[player.turn] = elem;
            }}
            onRoll={canRoll ? handleRoll : undefined}
            onPass={canPass ? handlePass : undefined}
          />
        ))}
      </Box>
    </>
  );
};

export default DiceGame;
