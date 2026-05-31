#if UNITY_WEBGL && !UNITY_EDITOR
#define JS_MIDDLEWARE
#endif

using System.Collections.Generic;

using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

using Paima.Middleware;
using System;

public class MainMiddleware : MonoBehaviour
{
  public Wallet lastWallet;
  public UserState userState;

  public static MainMiddleware Instance;

  private void Start()
  {
    if (Instance == null)
    {
      Instance = this;
      DontDestroyOnLoad(this);
    }
    else
    {
      Destroy(this);
    }
  }

  public async void UserWalletLogin(Action<LoginResponse> onLoginCallback)
  {
    LoginResponse response = await Query.UserWalletLogin(0, "metamask", false);
    if (response.success)
    {
      lastWallet = response.result;
      GetUserState();
    }
    onLoginCallback.Invoke(response);
  }


  public void GainExperience(int count)
  {
    AsyncUtils.WaitFor(Query.GainExperience(count), (response) =>
    {
      if (!response.success)
      {
        Debug.Log($"Gain experience failure: {response.errorMessage}");
        return;
      }
      //quick local update with mocked server logic instead of full refresh after onchain processing - GetUserState();
      userState.experience += count * 10;
    });
  }

  public void GetUserState()
  {
    AsyncUtils.WaitFor(Query.GetUserState(lastWallet.walletAddress), (response) =>
    {
      if (!response.success)
      {
        Debug.Log($"GetUserState failure: {response.errorMessage}");
        return;
      }

      userState = response.result;
    });
  }

  void Update()
  {
    Query.ProcessTasks();
  }
}
