import { Box } from "@mui/material";
import React, { useEffect } from "react";
import ReactDice, { ReactDiceProps, ReactDiceRef } from "react-dice-complete";

export type DiceRef = {
  roll: (result: [number] | [number, number]) => Promise<void>;
};

/**
 * Wrapper for ReactDice to make it possible to await roll function.
 */
export const Dice = React.forwardRef<
  DiceRef,
  Omit<ReactDiceProps, "rollDone" | "numDice">
>((props, ref) => {
  // IMPORTANT: changing the number of dice breaks react-dice-complete and it will
  // no longer trigger rollDone after roll is finished. To solve it, we render one ReactDice
  // for every possible number of dice and show only the current one.
  // Note: each ReactDice needs it's own ref.
  // TODO: find a better dice package

  const reactDiceRefs = React.useRef<{ 1?: ReactDiceRef; 2?: ReactDiceRef }>(
    {}
  );
  const [numDice, setNumDice] = React.useState<1 | 2>(2);
  const [rollDone, setRollDone] = React.useState<undefined | (() => void)>();
  const [schedule, setSchedule] = React.useState<
    | undefined
    | {
        rollDone: () => void;
        result: [number] | [number, number];
      }
  >();

  useEffect(() => {
    if (schedule != null || rollDone != null) return;

    const roll = async (result: [number] | [number, number]) => {
      return await new Promise<void>((resolve) => {
        setSchedule({
          rollDone: () => {
            setRollDone(undefined);
            resolve(undefined);
          },
          result,
        });
      });
    };
    const instance: DiceRef = { roll };

    if (typeof ref === "function") {
      ref(instance);
    } else {
      ref.current = instance;
    }
  }, [schedule, rollDone]);

  useEffect(() => {
    if (schedule == null) return;

    setRollDone(() => schedule.rollDone);
    const newNumDice = schedule.result.length;
    setNumDice(newNumDice);
    reactDiceRefs.current[newNumDice]?.rollAll(schedule.result);
    setSchedule(undefined);
  }, [schedule]);

  return (
    <Box>
      <Box sx={numDice === 1 ? {} : { display: "none" }}>
        <ReactDice
          {...props}
          ref={(elem) => (reactDiceRefs.current[1] = elem)}
          rollDone={rollDone ?? (() => {})}
          numDice={1}
        />
      </Box>
      <Box sx={numDice === 2 ? {} : { display: "none" }}>
        <ReactDice
          {...props}
          ref={(elem) => (reactDiceRefs.current[2] = elem)}
          rollDone={rollDone ?? (() => {})}
          numDice={2}
        />
      </Box>
    </Box>
  );
});
