/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetUserStats' parameters type */
export interface IGetUserStatsParams {
  wallet?: string | null | void;
}

/** 'GetUserStats' return type */
export interface IGetUserStatsResult {
  tokens: number;
  wallet: string;
}

/** 'GetUserStats' query type */
export interface IGetUserStatsQuery {
  params: IGetUserStatsParams;
  result: IGetUserStatsResult;
}

const getUserStatsIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":47,"b":53}]}],"statement":"SELECT * FROM global_user_state\nWHERE wallet = :wallet"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM global_user_state
 * WHERE wallet = :wallet
 * ```
 */
export const getUserStats = new PreparedQuery<IGetUserStatsParams,IGetUserStatsResult>(getUserStatsIR);


/** 'GetWorldStats' parameters type */
export type IGetWorldStatsParams = void;

/** 'GetWorldStats' return type */
export interface IGetWorldStatsResult {
  id: number;
  tokens: number;
}

/** 'GetWorldStats' query type */
export interface IGetWorldStatsQuery {
  params: IGetWorldStatsParams;
  result: IGetWorldStatsResult;
}

const getWorldStatsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM global_world_state"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM global_world_state
 * ```
 */
export const getWorldStats = new PreparedQuery<IGetWorldStatsParams,IGetWorldStatsResult>(getWorldStatsIR);


/** 'GetGameById' parameters type */
export interface IGetGameByIdParams {
  id: number;
}

/** 'GetGameById' return type */
export interface IGetGameByIdResult {
  block_height: number | null;
  id: number;
  prize: number | null;
  stage: string;
  wallet: string;
}

/** 'GetGameById' query type */
export interface IGetGameByIdQuery {
  params: IGetGameByIdParams;
  result: IGetGameByIdResult;
}

const getGameByIdIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":30,"b":33}]}],"statement":"SELECT * FROM game\nWHERE id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM game
 * WHERE id = :id!
 * ```
 */
export const getGameById = new PreparedQuery<IGetGameByIdParams,IGetGameByIdResult>(getGameByIdIR);


/** 'GetNewGame' parameters type */
export interface IGetNewGameParams {
  wallet: string;
}

/** 'GetNewGame' return type */
export interface IGetNewGameResult {
  block_height: number | null;
  id: number;
  prize: number | null;
  stage: string;
  wallet: string;
}

/** 'GetNewGame' query type */
export interface IGetNewGameQuery {
  params: IGetNewGameParams;
  result: IGetNewGameResult;
}

const getNewGameIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":34,"b":41}]}],"statement":"SELECT * FROM game\nWHERE wallet = :wallet!\nAND stage = 'new'\nORDER BY id DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM game
 * WHERE wallet = :wallet!
 * AND stage = 'new'
 * ORDER BY id DESC
 * LIMIT 1
 * ```
 */
export const getNewGame = new PreparedQuery<IGetNewGameParams,IGetNewGameResult>(getNewGameIR);


/** 'GetQuestionAnswer' parameters type */
export interface IGetQuestionAnswerParams {
  game_id: number;
  stage: string;
}

/** 'GetQuestionAnswer' return type */
export interface IGetQuestionAnswerResult {
  answer: string | null;
  block_height: number | null;
  game_id: number;
  message: string | null;
  question: string | null;
  score: number | null;
  stage: string;
}

/** 'GetQuestionAnswer' query type */
export interface IGetQuestionAnswerQuery {
  params: IGetQuestionAnswerParams;
  result: IGetQuestionAnswerResult;
}

const getQuestionAnswerIR: any = {"usedParamSet":{"game_id":true,"stage":true},"params":[{"name":"game_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":46,"b":54}]},{"name":"stage","required":true,"transform":{"type":"scalar"},"locs":[{"a":68,"b":74}]}],"statement":"SELECT * FROM question_answer\nWHERE game_id = :game_id!\nAND stage = :stage!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM question_answer
 * WHERE game_id = :game_id!
 * AND stage = :stage!
 * ```
 */
export const getQuestionAnswer = new PreparedQuery<IGetQuestionAnswerParams,IGetQuestionAnswerResult>(getQuestionAnswerIR);


/** 'GetAllQuestionAnswer' parameters type */
export interface IGetAllQuestionAnswerParams {
  game_id: number;
}

/** 'GetAllQuestionAnswer' return type */
export interface IGetAllQuestionAnswerResult {
  answer: string | null;
  block_height: number | null;
  game_id: number;
  message: string | null;
  question: string | null;
  score: number | null;
  stage: string;
}

/** 'GetAllQuestionAnswer' query type */
export interface IGetAllQuestionAnswerQuery {
  params: IGetAllQuestionAnswerParams;
  result: IGetAllQuestionAnswerResult;
}

const getAllQuestionAnswerIR: any = {"usedParamSet":{"game_id":true},"params":[{"name":"game_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":46,"b":54}]}],"statement":"SELECT * FROM question_answer\nWHERE game_id = :game_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM question_answer
 * WHERE game_id = :game_id!
 * ```
 */
export const getAllQuestionAnswer = new PreparedQuery<IGetAllQuestionAnswerParams,IGetAllQuestionAnswerResult>(getAllQuestionAnswerIR);


/** 'CreateGlobalUserState' parameters type */
export interface ICreateGlobalUserStateParams {
  wallet: string;
}

/** 'CreateGlobalUserState' return type */
export type ICreateGlobalUserStateResult = void;

/** 'CreateGlobalUserState' query type */
export interface ICreateGlobalUserStateQuery {
  params: ICreateGlobalUserStateParams;
  result: ICreateGlobalUserStateResult;
}

const createGlobalUserStateIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":47,"b":54}]}],"statement":"INSERT INTO global_user_state (wallet)\nVALUES (:wallet!)\nON CONFLICT (wallet) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO global_user_state (wallet)
 * VALUES (:wallet!)
 * ON CONFLICT (wallet) DO NOTHING
 * ```
 */
export const createGlobalUserState = new PreparedQuery<ICreateGlobalUserStateParams,ICreateGlobalUserStateResult>(createGlobalUserStateIR);


/** 'NewGame' parameters type */
export interface INewGameParams {
  wallet: string;
}

/** 'NewGame' return type */
export type INewGameResult = void;

/** 'NewGame' query type */
export interface INewGameQuery {
  params: INewGameParams;
  result: INewGameResult;
}

const newGameIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":34,"b":41}]}],"statement":"INSERT INTO game (wallet)\nVALUES (:wallet!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO game (wallet)
 * VALUES (:wallet!)
 * ```
 */
export const newGame = new PreparedQuery<INewGameParams,INewGameResult>(newGameIR);


/** 'NewQuestionAnswer' parameters type */
export interface INewQuestionAnswerParams {
  game_id: number;
  question: string;
  stage: string;
}

/** 'NewQuestionAnswer' return type */
export type INewQuestionAnswerResult = void;

/** 'NewQuestionAnswer' query type */
export interface INewQuestionAnswerQuery {
  params: INewQuestionAnswerParams;
  result: INewQuestionAnswerResult;
}

const newQuestionAnswerIR: any = {"usedParamSet":{"game_id":true,"stage":true,"question":true},"params":[{"name":"game_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":63,"b":71}]},{"name":"stage","required":true,"transform":{"type":"scalar"},"locs":[{"a":74,"b":80}]},{"name":"question","required":true,"transform":{"type":"scalar"},"locs":[{"a":83,"b":92}]}],"statement":"INSERT INTO question_answer (game_id, stage, question)\nVALUES (:game_id!, :stage!, :question!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO question_answer (game_id, stage, question)
 * VALUES (:game_id!, :stage!, :question!)
 * ```
 */
export const newQuestionAnswer = new PreparedQuery<INewQuestionAnswerParams,INewQuestionAnswerResult>(newQuestionAnswerIR);


/** 'SetAnswer' parameters type */
export interface ISetAnswerParams {
  answer: string;
  game_id: number;
  score: number;
  stage: string;
}

/** 'SetAnswer' return type */
export type ISetAnswerResult = void;

/** 'SetAnswer' query type */
export interface ISetAnswerQuery {
  params: ISetAnswerParams;
  result: ISetAnswerResult;
}

const setAnswerIR: any = {"usedParamSet":{"answer":true,"score":true,"game_id":true,"stage":true},"params":[{"name":"answer","required":true,"transform":{"type":"scalar"},"locs":[{"a":36,"b":43}]},{"name":"score","required":true,"transform":{"type":"scalar"},"locs":[{"a":54,"b":60}]},{"name":"game_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":78,"b":86}]},{"name":"stage","required":true,"transform":{"type":"scalar"},"locs":[{"a":100,"b":106}]}],"statement":"UPDATE question_answer\nSET answer = :answer!, score = :score!\nWHERE game_id = :game_id!\nAND stage = :stage!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE question_answer
 * SET answer = :answer!, score = :score!
 * WHERE game_id = :game_id!
 * AND stage = :stage!
 * ```
 */
export const setAnswer = new PreparedQuery<ISetAnswerParams,ISetAnswerResult>(setAnswerIR);


/** 'UpdateGame' parameters type */
export interface IUpdateGameParams {
  block_height: number;
  id: number;
  prize?: number | null | void;
  stage: string;
}

/** 'UpdateGame' return type */
export type IUpdateGameResult = void;

/** 'UpdateGame' query type */
export interface IUpdateGameQuery {
  params: IUpdateGameParams;
  result: IUpdateGameResult;
}

const updateGameIR: any = {"usedParamSet":{"stage":true,"block_height":true,"prize":true,"id":true},"params":[{"name":"stage","required":true,"transform":{"type":"scalar"},"locs":[{"a":24,"b":30}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":61}]},{"name":"prize","required":false,"transform":{"type":"scalar"},"locs":[{"a":72,"b":77}]},{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":90,"b":93}]}],"statement":"UPDATE game\nSET stage = :stage!, block_height = :block_height!, prize = :prize\nWHERE id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE game
 * SET stage = :stage!, block_height = :block_height!, prize = :prize
 * WHERE id = :id!
 * ```
 */
export const updateGame = new PreparedQuery<IUpdateGameParams,IUpdateGameResult>(updateGameIR);


/** 'UpdateUserGlobalPosition' parameters type */
export interface IUpdateUserGlobalPositionParams {
  change: number;
  wallet: string;
}

/** 'UpdateUserGlobalPosition' return type */
export type IUpdateUserGlobalPositionResult = void;

/** 'UpdateUserGlobalPosition' query type */
export interface IUpdateUserGlobalPositionQuery {
  params: IUpdateUserGlobalPositionParams;
  result: IUpdateUserGlobalPositionResult;
}

const updateUserGlobalPositionIR: any = {"usedParamSet":{"change":true,"wallet":true},"params":[{"name":"change","required":true,"transform":{"type":"scalar"},"locs":[{"a":47,"b":54}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":71,"b":78}]}],"statement":"UPDATE global_user_state\nSET tokens = tokens + :change!\nWHERE wallet = :wallet!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_user_state
 * SET tokens = tokens + :change!
 * WHERE wallet = :wallet!
 * ```
 */
export const updateUserGlobalPosition = new PreparedQuery<IUpdateUserGlobalPositionParams,IUpdateUserGlobalPositionResult>(updateUserGlobalPositionIR);


/** 'UpdateTokens' parameters type */
export interface IUpdateTokensParams {
  change: number;
}

/** 'UpdateTokens' return type */
export type IUpdateTokensResult = void;

/** 'UpdateTokens' query type */
export interface IUpdateTokensQuery {
  params: IUpdateTokensParams;
  result: IUpdateTokensResult;
}

const updateTokensIR: any = {"usedParamSet":{"change":true},"params":[{"name":"change","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":55}]}],"statement":"UPDATE global_world_state\nSET tokens = tokens + :change!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_world_state
 * SET tokens = tokens + :change!
 * ```
 */
export const updateTokens = new PreparedQuery<IUpdateTokensParams,IUpdateTokensResult>(updateTokensIR);


