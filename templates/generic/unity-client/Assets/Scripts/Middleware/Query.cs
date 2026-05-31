#if UNITY_WEBGL && !UNITY_EDITOR
#define JS_MIDDLEWARE
#endif

using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

namespace Paima.Middleware
{

  public static class Query
  {
#if JS_MIDDLEWARE

    // Integrate with JS following https://docs.unity3d.com/Manual/webgl-interactingwithbrowserscripting.html

    [DllImport("__Internal")]
    private static extern int bridge_userWalletLogin(int mode, string name, int preferBatchedMode);
    [DllImport("__Internal")]
    private static extern int bridge_getUserState(string walletAddress);
    [DllImport("__Internal")]
    private static extern int bridge_gainExperience(int count);
    [DllImport("__Internal")]
    private static extern string bridge_getNextAnswer();
#else

    /* Consecutive id, to test answers in mockup of middleware in C# (that will work in Unity Editor) */
    private static int mockupNextAnswerId = 1;

    private static List<AsyncAnswer> mockupAnswers = new List<AsyncAnswer>();

    /* Fake answer for *every* async query.
     * Fills every AsyncAnswer field (even though only one field is in practice expected).
     */
    private static int NewMockupAnswer()
    {
      int answerId = mockupNextAnswerId++;
      AsyncAnswer newAnswer = new AsyncAnswer()
      {
        answerId = answerId,
        loginResponse = new LoginResponse()
        {
          result = new Wallet()
          {
            walletAddress = "fake-wallet-addr-" + answerId,
          },
          success = true,
        },
        actionResponse = new ActionResponse()
        {
          success = true
        },
        userStateResponse = new UserStateResponse()
        {
          result = new UserState()
          {
            experience = 1,
            wallet = "fake-wallet-addr-" + answerId,
          },
          success = true
        }
      };

      mockupAnswers.Add(newAnswer);
      return answerId;
    }
#endif

    private static Dictionary<int, TaskCompletionSource<AsyncAnswer>> waitingTasks =
    new Dictionary<int, TaskCompletionSource<AsyncAnswer>>();

    /**
     * Checks if the user’s wallet has previously authorized connecting to the game. If yes, then it will instantly
     * return the wallet information. If not, then the user will have a pop-up window which they will have to
     * confirm authorizing connecting their wallet to the game, before the data is returned.
     */
    public static async Task<LoginResponse> UserWalletLogin(int mode, string name, bool preferBatchedMode)
    {
#if JS_MIDDLEWARE
      int answerId = bridge_userWalletLogin(mode, name, preferBatchedMode ? 1 : 0);
#else
      int answerId = NewMockupAnswer();
#endif

      // add a task, code from the outside (ProcessTasks) will complete the task

      TaskCompletionSource<AsyncAnswer> taskCompletion = new TaskCompletionSource<AsyncAnswer>();
      waitingTasks.Add(answerId, taskCompletion);
      await taskCompletion.Task;

      return taskCompletion.Task.Result.loginResponse;
    }

    public static async Task<UserStateResponse> GetUserState(string wallet)
    {
#if JS_MIDDLEWARE
      int answerId = bridge_getUserState(wallet);
#else
      int answerId = NewMockupAnswer();
#endif

      // add a task, code from the outside (ProcessTasks) will complete the task

      TaskCompletionSource<AsyncAnswer> taskCompletion = new TaskCompletionSource<AsyncAnswer>();
      waitingTasks.Add(answerId, taskCompletion);
      await taskCompletion.Task;

      return taskCompletion.Task.Result.userStateResponse;
    }

    public static async Task<ActionResponse> GainExperience(int count)
    {
#if JS_MIDDLEWARE
      int answerId = bridge_gainExperience(count);
#else
      int answerId = NewMockupAnswer();
#endif

      // add a task, code from the outside (ProcessTasks) will complete the task

      TaskCompletionSource<AsyncAnswer> taskCompletion = new TaskCompletionSource<AsyncAnswer>();
      waitingTasks.Add(answerId, taskCompletion);
      await taskCompletion.Task;

      return taskCompletion.Task.Result.actionResponse;
    }

    public static void ProcessTasks()
    {
      AsyncAnswer answer = null;
#if JS_MIDDLEWARE
      string jsonResponse = bridge_getNextAnswer();
      if (!string.IsNullOrEmpty(jsonResponse))
      {
        answer = JsonUtility.FromJson<AsyncAnswer>(jsonResponse);
        // skip redundant actionResponse type of responses
        // (the most sensible check since unity's serialization utility replaces non existent values with fully initialized classes)
        if (!jsonResponse.Contains("\"actionResponse\":"))
        {
          Debug.Log($"Received JSON:\n{jsonResponse}");
        }
      }
#else
      if (mockupAnswers.Count != 0)
      {
        answer = mockupAnswers.First();
        mockupAnswers.RemoveAt(0);
      }
#endif

      if (answer != null)
      {
        if (waitingTasks.TryGetValue(answer.answerId, out TaskCompletionSource<AsyncAnswer> taskCompletion))
        {
          waitingTasks.Remove(answer.answerId);
          taskCompletion.SetResult(answer);
        }
        else
        {
          Debug.LogWarning("Got asynchronous answer " + answer.answerId + " but nothing is waiting for it");
        }
      }
    }
  }

}
