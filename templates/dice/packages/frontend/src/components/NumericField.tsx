import * as React from "react";
import UpIcon from "@mui/icons-material/KeyboardArrowUp";
import DownIcon from "@mui/icons-material/KeyboardArrowDown";

import {
  TextField,
  BaseTextFieldProps,
  OutlinedInputProps,
  InputAdornment,
  IconButton,
} from "@mui/material";

interface NumericFieldProps extends BaseTextFieldProps {
  onChange: (value: string) => void;
}

const NumericField: React.FC<NumericFieldProps> = ({ onChange, ...props }) => {
  return (
    <TextField
      type="number"
      variant="outlined"
      onChange={(event) => onChange(event.target.value)}
      {...props}
    />
  );
};

export default NumericField;
