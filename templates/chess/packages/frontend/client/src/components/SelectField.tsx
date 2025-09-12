import React from "react";

import type { SelectProps } from "@mui/material";
import { Box, MenuItem, Select, Typography } from "@mui/material";

interface Props extends SelectProps {
  displayTransform?: (value: string | number) => string;
  items: readonly (string | number)[];
}

export const SelectField: React.FC<Props> = ({
  displayTransform,
  items,
  label,
  ...props
}) => {
  return (
    <Box>
      <Typography variant="subtitle1" textAlign="left">
        {label}
      </Typography>
      <Select fullWidth {...props}>
        {items.map((item, index) => (
          <MenuItem key={index} value={item}>
            {displayTransform?.(item) || item}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
};
