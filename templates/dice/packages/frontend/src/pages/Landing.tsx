import { Button, Container } from "@mui/material";
import { AppContext } from "@src/main";
import MainController from "@src/MainController";
import React, { useContext, useState } from "react";
import * as Paima from "@dice/middleware";
import "./Landing.scss";

const LandingPage: React.FC = () => {
  const mainController: MainController = useContext(AppContext);
  const [acceptTos, setAcceptTos] = useState(false);

  // These are for debugging purposes
  // const logMiddleware = () => {
  //   console.log('Paima MW: ', Paima.default);
  // };

  // const statusMiddleware = async () => {
  //   const status = await Paima.default.checkWalletStatus();
  //   console.log('Paima Wallet Status: ', status)
  // }

  // const connectMiddleware = async () => {
  //   const connect = await Paima.default.userWalletLogin({
      //   mode: WalletMode.EvmInjected,
      //   preferBatchedMode: false,
      // });
  //   console.log("Paima Wallet Connection: ", connect);
  // }

  return (
    <Container>
      <div className="landing-page">
        <h1 className="title">Dice</h1>
        {/* <button onClick={logMiddleware}>i</button>
        <button onClick={statusMiddleware}>s</button>
        <button onClick={connectMiddleware}>c</button> */}
        <label className="accept-tos">
          <input
            type="checkbox"
            checked={acceptTos}
            onChange={() => setAcceptTos(!acceptTos)}
          />
          <span className="tos-text">Accept TOS and Privacy Policy</span>
        </label>
        <Button
          variant="contained"
          disabled={!acceptTos}
          onClick={() => mainController.connectWallet()}
        >
          Connect
        </Button>
      </div>
    </Container>
  );
};

export default LandingPage;
