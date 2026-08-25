import type { DustFundsReadiness } from "@effectstream/midnight-contracts";
import { waitForDustFunds } from "./faucet.ts";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

type FaucetDustFunds = Awaited<ReturnType<typeof waitForDustFunds>>;

const returnsCompleteReadiness: Equal<
  FaucetDustFunds,
  DustFundsReadiness
> = true;

void returnsCompleteReadiness;
