import { createTheme } from "@mui/material";

declare module "@mui/material/styles" {
  interface Palette {
    menuButton: {
      main: string;
      dark: string;
    };
  }
  interface PaletteOptions {
    menuButton: {
      main: string;
      dark: string;
    };
  }
}
export const theme = createTheme({
  palette: {
    menuButton: {
      main: "#9EF79E",
      dark: "#507e50",
    },
    primary: {
      main: "#73B573",
      light: "#AFC39D",
    },
    secondary: {
      main: "#364329",
    },
  },
  typography: {
    fontFamily: ["Inter", "Arial", "sans-serif"].join(","),
    h1: {
      fontSize: 32,
      color: "#BDCEAF",
      fontWeight: 800,
    },
    button: {
      fontStyle: "normal",
      fontWeight: 700,
      fontSize: 18,
      color: "#212919",
      textTransform: "none",
    },
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: "transparent",
          fontWeight: 700,
          fontSize: "14px",
          color: "white",
          opacity: 0.6,
        },
        body: {
          fontWeight: 700,
          fontSize: "16px",
          color: "white",
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        toolbar: {
          fontWeight: 500,
          fontSize: "16px",
          color: "white",
        },
        select: { fontWeight: 700 },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: { color: "white" },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        input: {
          color: "white",
          fontWeight: 700,
          fontSize: "18px",
        },
        notchedOutline: {
          borderColor: "white",
          padding: "0 10px",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "white",
          opacity: 0.6,
          fontWeight: 700,
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
  },
});
