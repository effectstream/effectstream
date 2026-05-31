using System.Collections;
using System.Collections.Generic;

/*
* Classes and enums matching Paima JS middleware, returned by Query.
*/

namespace Paima.Middleware
{
  [System.Serializable]
  public class ActionResponse
  {
    public bool success;
    public string errorMessage;
    public ErrorUtils.ErrorCode errorCode;
  }

  [System.Serializable]
  public class LoginResponse : ActionResponse
  {
    public Wallet result;
  }

  [System.Serializable]
  public class UserStateResponse : ActionResponse
  {
    public UserState result;
  }

  [System.Serializable]
  public class Wallet
  {
    public string walletAddress;
  }

  [System.Serializable]
  public class UserState
  {
    public int experience;
    public string wallet;
  }

  /* Wrapper for all possible answers from the middleware */
  [System.Serializable]
  public class AsyncAnswer
  {
    public int answerId;

    /* Possible results of async functions in middleware. 
      At most one of them will be non-null at given answer.
    
      Note that wrapping all answers in AsyncAnswer also avoids
      JsonUtility deficiency: it cannot handle a simple array in JSON,
      it requires such array to be wrapped in a class.
    */
    public LoginResponse loginResponse;
    public UserStateResponse userStateResponse;
    public ActionResponse actionResponse;
    public long blockHeight;
  }

}