import React from "react";

import type { BaseTextFieldProps } from "@mui/material";
import { Box, TextField, Typography } from "@mui/material";

interface NumericFieldProps extends BaseTextFieldProps {
  onChange: (value: string) => void;
}

const NumericField: React.FC<NumericFieldProps> = ({
  onChange,
  label,
  ...props
}) => {
  return (
    <Box>
      <Typography variant="subtitle1" textAlign="left">
        {label}
      </Typography>
      <TextField
        type="number"
        fullWidth
        variant="outlined"
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </Box>
  );
};

export default NumericField;
