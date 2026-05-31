/* Helper JS code to interact with Paima middleware. */

var paimaAnswers = [];

var paimaNextAnswerId = 1;

var roundExecutor;

/* Call JS async function, capture the execution into paimaAnswers.
 *
 * promise is the return from JS async function call.
 *
 * answerType (string) corresponds to AsyncAnswer field in C# where we should place answer.
 */
function paimaAsyncCall(promise, answerType)
{
    var answerId = window.paimaNextAnswerId;
    window.paimaNextAnswerId++;
    promise.then(function (middlewareAnswer) {
        var answerComplete = {"answerId":answerId};
        answerComplete[answerType] = middlewareAnswer;
        //console.log("answerId " + answerId + " = "+ middlewareAnswer);
        window.paimaAnswers.push(answerComplete);
    });

    return answerId;
}
