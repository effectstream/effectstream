import React, { useContext, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Typography,
} from "@mui/material";
import type { MainController } from "../MainController.ts";
import { AppContext } from "../main.tsx";
import { Layout } from "../layouts/Layout.tsx";
import { Card } from "../components/Card.tsx";
import { BLOCK_TIME } from "../utils/constants.ts";
import { blocksToTime } from "../utils/index.ts";
import { SelectField } from "../components/SelectField.tsx";

const dayBlocks = (24 * 60 * 60) / BLOCK_TIME;
// 10m, 15m, 30m, 1h, 24h
const gameLengths = [
  (10 * 60) / BLOCK_TIME,
  (15 * 60) / BLOCK_TIME,
  (30 * 60) / BLOCK_TIME,
  (60 * 60) / BLOCK_TIME,
  dayBlocks,
];

const roundLengths = [
  (1 * 60) / BLOCK_TIME,
  (2 * 60) / BLOCK_TIME,
  (3 * 60) / BLOCK_TIME,
  (5 * 60) / BLOCK_TIME,
  (8 * 60) / BLOCK_TIME,
  (10 * 60) / BLOCK_TIME,
  (90 * 60) / BLOCK_TIME,
];

const difficulties = [1, 2, 3] as const;
const difficultyName = (value: number): string => {
  const difficulty: Record<number, string> = {
    1: "Easy",
    2: "Medium",
    3: "Hard",
  };

  return difficulty[value];
};

export const CreateLobby: React.FC = () => {
  const mainController: MainController = useContext(AppContext) as unknown as MainController;

  const [roundLength, setRoundLength] = useState(roundLengths[3]);
  const [playersTime, setPlayersTime] = useState(gameLengths[2]);
  const [creatorIsWhite, setCreatorIsWhite] = useState(true);
  const [isHidden, setIsHidden] = useState(false);
  const [isPractice, setIsPractice] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<number>(difficulties[0]);

  const handleCreateLobby = async () => {
    // arbitrarily chosen limit
    const roundsLimit = 500;
    //mainController.connectWallet()

    await mainController.createLobby(
      mainController.userAddress as string,
      roundsLimit,
      roundLength,
      playersTime,
      botDifficulty,
      isHidden,
      isPractice,
      creatorIsWhite,
    );
  };

  return (
    <Layout small>
      <Card layout blurred>
        <Typography variant="h2">Create</Typography>
        <Box>
          <Box sx={{ display: "flex", flexFlow: "column", gap: "2rem" }}>
            <SelectField
              label="Player's Time"
              items={gameLengths}
              value={playersTime}
              onChange={(event) => setPlayersTime(event.target.value as number)}
              displayTransform={blocksToTime}
            />
            <SelectField
              label="Single Move Timeout"
              items={roundLengths}
              value={roundLength}
              onChange={(event) => setRoundLength(event.target.value as number)}
              displayTransform={blocksToTime}
            />
            <Box sx={{ display: "flex" }}>
              <FormControlLabel
                sx={{ flex: "1" }}
                control={
                  <Checkbox
                    checked={creatorIsWhite}
                    onChange={(event) =>
                      setCreatorIsWhite(event.target.checked)}
                  />
                }
                label="Play as white"
              />
              <FormControlLabel
                sx={{ flex: "1" }}
                control={
                  <Checkbox
                    checked={isHidden}
                    onChange={(event) => setIsHidden(event.target.checked)}
                  />
                }
                label="Hidden lobby"
              />
            </Box>
            <FormControlLabel
              sx={{ flex: "1" }}
              control={
                <Checkbox
                  checked={isPractice}
                  onChange={(event) => setIsPractice(event.target.checked)}
                />
              }
              label="Single player (vs AI)"
            />
          </Box>

          {isPractice && (
            <SelectField
              displayTransform={difficultyName}
              label="Bot difficulty"
              items={difficulties}
              value={botDifficulty}
              onChange={(event) =>
                setBotDifficulty(event.target.value as number)}
            />
          )}
        </Box>
        <Button onClick={handleCreateLobby}>Create</Button>
      </Card>
    </Layout>
  );
};
