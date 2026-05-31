using System;
using System.Threading.Tasks;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace Paima.Middleware {

public static class AsyncUtils 
{
    public delegate void ExecuteWithValue<T>(T value);

    public static async void WaitFor<T>(Task<T> task, ExecuteWithValue<T> callback)
    {
        await task;
        callback(task.Result);

        /* This is the traditional way to implement this, but WebGL doesn't support ContinueWith()
           (it never executes).
        */
        /*
        task.ContinueWith(t =>
        {
            if (t.IsFaulted)
            {
                Debug.Log("Error: " + t.Exception.InnerException.Message);
            }
            else
            {
                callback(t.Result);
            }
        });
        */
    }
}

}