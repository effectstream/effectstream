using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using TMPro;

public class UIUpdater : MonoBehaviour
{
  [SerializeField] private TextMeshProUGUI progressText;

  void Update()
  {
    progressText.text = $"XP: {MainMiddleware.Instance.userState.experience}";
  }
}
