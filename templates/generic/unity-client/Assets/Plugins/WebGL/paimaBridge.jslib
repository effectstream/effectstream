/* -*- mode: javascript -*-

  Bring Paima middleware into Unity JSLIB.
  This way we can call them from C#.
  See https://docs.unity3d.com/Manual/webgl-interactingwithbrowserscripting.html .

  Note: Alternative would be using Application.ExternalCall,
  https://docs.unity3d.com/ScriptReference/Application.ExternalCall.html .
  But we follow the new, recommended approach. Such additional "bridge"
  also allows to process the data in JS reliably --
  like wrap JS result structure -> JSON string -> C# string.

  Refs:
  - JS async: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function
*/

mergeInto(LibraryManager.library, {
  bridge_getNextAnswer: function () {
    if (window.paimaAnswers.length > 0) {
      var nextAnswer = window.paimaAnswers.shift();
      var returnStr = JSON.stringify(nextAnswer);
    } else {
      var returnStr = "";
    }
    var bufferSize = lengthBytesUTF8(returnStr) + 1;
    var buffer = _malloc(bufferSize);
    stringToUTF8(returnStr, buffer, bufferSize);
    return buffer;
  },

  //============================================================================================== MIDDLEWARE BRIDGE BEGIN

  bridge_getUserState: function (walletAddress) {
    return paimaAsyncCall(
      getUserState(UTF8ToString(walletAddress)),
      "userStateResponse",
    );
  },
  bridge_gainExperience: function (count) {
    return paimaAsyncCall(gainExperience(count), "actionResponse");
  },
  bridge_userWalletLogin: function (mode, name, preferBatchedMode) {
    return paimaAsyncCall(
      userWalletLogin({ mode, name: UTF8ToString(name), preferBatchedMode }),
      "loginResponse",
    );
  },

  //============================================================================================== MIDDLEWARE BRIDGE END
});
