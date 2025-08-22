import { createTheme } from "@mui/material";

const gray = "#898989";
const darkBlue = "#25515B";
const lightBlue = "#57E7FB";
const pink = "#FCA2F9";

const squareLight = "#D8E9EB";
const squareDark = "#907B90";

export const theme = createTheme({
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 992,
      lg: 1268,
      xl: 1536,
    },
  },
  palette: {
    primary: {
      main: darkBlue,
      light: lightBlue,
      dark: "#000000",
      contrastText: gray,
    },
    secondary: {
      main: squareLight,
      light: squareLight,
      dark: squareDark,
    },
    background: {
      default: "#ffffff",
    },
  },
  typography: {
    fontFamily: ["Inter", "Arial", "sans-serif"].join(","),
    h2: {
      fontStyle: "normal",
      fontWeight: 500,
      fontSize: 20,
      color: "white",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    },
    subtitle1: {
      fontStyle: "normal",
      fontWeight: 500,
      fontSize: "14px",
      color: gray,
    },
    body1: {
      fontStyle: "normal",
      fontWeight: 500,
      fontSize: "16px",
      textAlign: "center",
      color: "white",
    },
  },
  components: {
    MuiList: {
      styleOverrides: {
        root: {
          backgroundColor: darkBlue,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          textAlign: "left",
        },
        icon: { color: "white" },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          ":hover .MuiOutlinedInput-notchedOutline": {
            borderColor: lightBlue,
          },
        },
        input: {
          color: "white",
          fontWeight: 700,
          fontSize: "18px",
        },
        notchedOutline: {
          borderColor: darkBlue,
        },
      },
    },
    MuiFormControlLabel: {
      styleOverrides: {
        label: {
          fontWeight: 700,
          fontSize: "14px",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          background: `linear-gradient(90deg, ${lightBlue} 0%, ${pink} 100%)`,
          borderRadius: "4px",
          color: "black",
          fontWeight: 600,
          fontSize: "16px",
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: squareDark,
          backgroundColor: squareLight,
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: darkBlue,
          "&.Mui-checked": {
            color: lightBlue,
          },
        },
      },
    },
  },
});
