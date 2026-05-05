import React from "react";
import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";

interface Props {
  label: string;
  items: readonly any[];
  value: any;
  onChange: (event: any) => void;
  displayTransform?: (value: any) => string;
}

export const SelectField: React.FC<Props> = ({
  label,
  items,
  value,
  onChange,
  displayTransform,
}) => {
  return (
    <FormControl fullWidth>
      <InputLabel sx={{ color: "white" }}>{label}</InputLabel>
      <Select value={value} label={label} onChange={onChange}>
        {items.map((item) => (
          <MenuItem key={String(item)} value={item}>
            {displayTransform ? displayTransform(item) : String(item)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
