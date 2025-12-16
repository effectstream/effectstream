import { PaimaParser } from '@paima/sdk/concise';
import type { ParsedSubmittedInput } from './types';
import { ENV } from '@paima/sdk/utils';

const myGrammar = `
createdLobby        = c|numOfRounds|roundLength|isHidden?|isPractice?
joinedLobby         = j|*lobbyID
closedLobby         = cs|*lobbyID
submittedMoves      = s|*lobbyID|roundNumber|move_rps
zombieScheduledData = z|*lobbyID
userScheduledData   = u|*user|result
`;

const parserCommands = {
  createdLobby: {
    numOfRounds: PaimaParser.NumberParser(3, 1000),
    roundLength: PaimaParser.DefaultRoundLength(ENV.BLOCK_TIME),
    isHidden: PaimaParser.TrueFalseParser(false),
    isPractice: PaimaParser.TrueFalseParser(false),
  },
  joinedLobby: {
    lobbyID: PaimaParser.NCharsParser(12, 12),
  },
  closedLobby: {
    lobbyID: PaimaParser.NCharsParser(12, 12),
  },
  submittedMoves: {
    lobbyID: PaimaParser.NCharsParser(12, 12),
    roundNumber: PaimaParser.NumberParser(1, 1000),
    move_rps: PaimaParser.RegexParser(/^[RPS]$/),
  },
  zombieScheduledData: {
    renameCommand: 'scheduledData',
    effect: 'zombie',
    lobbyID: PaimaParser.NCharsParser(12, 12),
  },
  userScheduledData: {
    renameCommand: 'scheduledData',
    effect: 'stats',
    user: PaimaParser.WalletAddress(),
    result: PaimaParser.RegexParser(/^[w|t|l]$/),
  },
};

const myParser = new PaimaParser(myGrammar, parserCommands);

function parse(s: string): ParsedSubmittedInput {
  try {
    const parsed = myParser.start(s);
    return { input: parsed.command, ...parsed.args } as any;
  } catch (e) {
    console.log(e, 'Parsing error');
    return { input: 'invalidString' };
  }
}

export default parse;
