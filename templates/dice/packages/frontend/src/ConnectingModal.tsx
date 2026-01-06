import React from "react";
import {
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import Wrapper from "./components/Wrapper";

export default function ConnectingModal({ open }: { open: boolean }) {
  return (
    <Dialog
      open={open}
      PaperProps={{
        sx: { background: "none", boxShadow: "none" },
      }}
    >
      <Wrapper small>
        <DialogTitle color="white">Connecting to Metamask...</DialogTitle>
        <DialogContent>
          <DialogContentText color="white">
            If a popup doesn't open, see if metamask made a silent notification.
          </DialogContentText>
        </DialogContent>
      </Wrapper>
    </Dialog>
  );
}
