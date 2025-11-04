export type ErrorCode = number;
export type ErrorMessageMapping = Record<ErrorCode, string>;

export type ErrorMessageFxn = (errorCode: ErrorCode) => string;

export interface SuccessfulResultMessage {
  success: true;
  message: string;
}

export interface SuccessfulResult<T> {
  success: true;
  result: T;
}

export interface FailedResult {
  success: false;
  errorMessage: string;
  errorCode?: number;
}

export type Result<T> = SuccessfulResult<T> | FailedResult;

export type InternalServerErrorResult = FailedResult;

/** comes from the `tsoa` package, but we don't want it as a dependency just for this type  */
export interface FieldErrors {
  [name: string]: {
    message: string;
    value?: any;
  };
}
export interface ValidateErrorResult {
  message: "Validation Failed";
  details?: FieldErrors;
}
