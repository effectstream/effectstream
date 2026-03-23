/// A simple always-succeeds spend validator for e2e testing.
validator hello {
  spend(_datum, _redeemer, _own_ref, _tx) {
    True
  }
}
