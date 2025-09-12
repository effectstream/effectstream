import React from "react";
import { styled, alpha } from "@mui/material/styles";
import InputBase from "@mui/material/InputBase";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import { IconButton } from "@mui/material";

// TODO: use styled components across the app
// inspired by https://mui.com/material-ui/react-app-bar/#app-bar-with-search-field
const Search = styled("div")(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  flexFlow: "row",
  alignItems: "center",
  position: "relative",
  width: "527px",
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.primary.main}`,
  backgroundColor: alpha(theme.palette.primary.main, 0.3),
  "&:hover": {
    backgroundColor: alpha(theme.palette.primary.main, 0.4),
  },
  marginLeft: 0,
}));

const SearchIconWrapper = styled("div")(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: "100%",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const RefreshIconWrapper = styled(IconButton)(({ theme }) => ({
  padding: theme.spacing(0, 2),
  color: theme.palette.background.default,
  height: "100%",
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: "inherit",
  flex: 1,
  "& .MuiInputBase-input": {
    padding: theme.spacing(1, 1, 1, 1),
    width: "100%",
  },
}));

interface SearchAppBarProps {
  value: string;
  onSearch: (query: string) => void;
  onRefresh: () => void;
}

const SearchBar: React.FC<SearchAppBarProps> = ({
  value,
  onSearch,
  onRefresh,
}) => {
  return (
    <Search>
      <RefreshIconWrapper onClick={onRefresh}>
        <RefreshIcon />
      </RefreshIconWrapper>
      <StyledInputBase
        value={value}
        // TODO: this searches in all values, AFAIK
        placeholder="Search lobby ID…"
        inputProps={{ "aria-label": "search" }}
        onChange={(e) => onSearch(e.target.value)}
      />
      <SearchIconWrapper>
        <SearchIcon />
      </SearchIconWrapper>
    </Search>
  );
};

export default SearchBar;
