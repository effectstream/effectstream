import React from "react";

import "./Card.scss";

import clsx from "clsx";
import type { BoxProps } from "@mui/material";
import { Box } from "@mui/material";

interface Props extends BoxProps {
  blurred?: boolean;
  layout?: boolean;
  children?: React.ReactNode;
  className?: string;
}

const Card: React.FC<Props> = ({
  blurred,
  layout,
  children,
  className,
  ...props
}) => {
  return (
    <Box
      className={clsx("card", blurred && "card--blurred", className)}
      {...props}
    >
      {layout ? (
        <Box
          sx={{
            padding: "32px",
            display: "flex",
            justifyContent: "center",
            flexFlow: "column",
            gap: "32px",
          }}
        >
          {children}
        </Box>
      ) : (
        children
      )}
    </Box>
  );
};

export default Card;
