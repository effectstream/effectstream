import React, { useContext, useState } from "react";
import "./CreateLobby.scss";
import { Box, Checkbox, FormControlLabel } from "@mui/material";
import MainController from "@src/MainController";
import Navbar from "@src/components/Navbar";
import { AppContext } from "@src/main";
import Wrapper from "@src/components/Wrapper";
import Button from "@src/components/Button";
import NumericField from "@src/components/NumericField";
import { useGlobalStateContext } from "@src/GlobalStateContext";

const CreateLobby: React.FC = () => {
  const mainController: MainController = useContext(AppContext);
  const {
    selectedNftState: [selectedNft],
  } = useGlobalStateContext();

  const [numberOfRounds, setNumberOfRounds] = useState("5");
  const [roundLength, setRoundLength] = useState("100");
  const [playersTime, setPlayersTime] = useState("100");
  const [isHidden, setIsHidden] = useState(false);
  const [isPractice, setIsPractice] = useState(false);

  const handleCreateLobby = async () => {
    const numberOfRoundsNum = parseInt(numberOfRounds);
    const roundLengthNum = parseInt(roundLength);
    const playersTimeNum = parseInt(playersTime);

    await mainController.createLobby(
      selectedNft,
      numberOfRoundsNum,
      roundLengthNum,
      playersTimeNum,
      isHidden,
      isPractice
    );
  };

  return (
    <>
      <Navbar />
      <Wrapper small>
        <Box>
          {
            <Box sx={{ display: "flex", flexFlow: "column", gap: "2rem" }}>
              <NumericField
                label="Number of Rounds"
                value={numberOfRounds}
                onChange={setNumberOfRounds}
              />
              {
                // TODO: disabled - need to be properly implemented on the backend:
                /* <NumericField
                label="Player's Time"
                value={playersTime}
                onChange={setPlayersTime}
              />
              <NumericField
                label="Round Length"
                value={roundLength}
                onChange={setRoundLength}
              /> */
              }
            </Box>
          }
          <Box sx={{ display: "flex", paddingTop: "24px" }}>
            {
              // TODO: disabled - needs to be checked and fixed
              /* <FormControlLabel
              sx={{ flex: "1" }}
              control={
                <Checkbox
                  checked={isHidden}
                  onChange={(event) => setIsHidden(event.target.checked)}
                />
              }
              label="Is Hidden?"
            /> */
            }
            <FormControlLabel
              sx={{ flex: "1" }}
              control={
                <Checkbox
                  checked={isPractice}
                  onChange={(event) => setIsPractice(event.target.checked)}
                />
              }
              label="Single-Player vs. Bots"
            />
          </Box>
        </Box>

        <Button onClick={handleCreateLobby}>Create</Button>
      </Wrapper>
    </>
  );
};

export default CreateLobby;
