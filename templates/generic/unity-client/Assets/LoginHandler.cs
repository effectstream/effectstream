using System.Collections;
using System.Collections.Generic;
using UnityEngine;

using Paima.Middleware;

public class LoginHandler : MonoBehaviour
{
  public void Login()
  {
    MainMiddleware.Instance.UserWalletLogin(OnLoginFinished);
  }

  private void OnLoginFinished(LoginResponse response)
  {
    Debug.Log($"Logged in {response}");
  }
}
