import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";

export const StatusSection = () => {
  const [evmCounter1, setEvmCounter1] = useState<number>(0);
  const [evmCounter2, setEvmCounter2] = useState<number>(0);
  const [cardanoCounter, setCardanoCounter] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    // Update timestamp immediately
    setLastUpdated(new Date().toLocaleTimeString());

    // EVM #1 - increment every 2 seconds
    const evmInterval1 = setInterval(() => {
      setEvmCounter1((prev) => prev + 1);
      setLastUpdated(new Date().toLocaleTimeString());
    }, 200);

    // EVM #2 - increment every 2.5 seconds
    const evmInterval2 = setInterval(() => {
      setEvmCounter2((prev) => prev + 1);
      setLastUpdated(new Date().toLocaleTimeString());
    }, 500);

    // Cardano #1 - increment every 1 second
    const cardanoInterval = setInterval(() => {
      setCardanoCounter((prev) => prev + 1);
      setLastUpdated(new Date().toLocaleTimeString());
    }, 1000);

    return () => {
      clearInterval(evmInterval1);
      clearInterval(evmInterval2);
      clearInterval(cardanoInterval);
    };
  }, []);

  return _jsxs(Box, {
    flexDirection: "column",
    padding: 1,
    children: [
      _jsx(Text, { color: "blue", children: "=== Chain Status ===" }),
      _jsx(Text, { children: "" }),
      _jsx(Text, { color: "gray", children: `Last updated: ${lastUpdated}` }),
      _jsx(Text, { children: "" }),
      _jsx(Text, {
        color: "green",
        children: `EVM #1 latest block ${evmCounter1.toLocaleString()}`,
      }),
      _jsx(Text, {
        color: "green",
        children: `EVM #2 latest block ${evmCounter2.toLocaleString()}`,
      }),
      _jsx(Text, {
        color: "green",
        children: `Cardano #1 latest block ${cardanoCounter.toLocaleString()}`,
      }),
    ],
  });
};
