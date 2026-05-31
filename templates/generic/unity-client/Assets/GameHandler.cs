using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class GameHandler : MonoBehaviour
{
  public void GainExperience()
  {
    int count = Random.Range(1, 5);
    MainMiddleware.Instance.GainExperience(count);
  }
}
