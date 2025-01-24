// TODO: move this to be a pure lib in the future

// TODO: this is blocked on https://github.com/denoland/deno/pull/27009

// import React, { useEffect, useState } from "react";
// import { render, Text } from "ink";

// const Counter = () => {
//   const [counter, setCounter] = useState(0);

//   useEffect(() => {
//     const timer = setInterval(() => {
//       setCounter((previousCounter) => previousCounter + 1);
//     }, 100);

//     return () => {
//       clearInterval(timer);
//     };
//   }, []);

//   return <Text color="green">{counter} tests passed</Text>;
// };

// render(<Counter />);
