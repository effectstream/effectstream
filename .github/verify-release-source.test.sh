#!/usr/bin/env bash

set -euo pipefail

test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
guard="$test_dir/verify-release-source.sh"
temp_root="$(mktemp -d "${TMPDIR:-/tmp}/effectstream-release-source-test.XXXXXX")"
trap 'rm -rf "$temp_root"' EXIT

origin="$temp_root/origin.git"
seed="$temp_root/seed"

git init --bare --quiet "$origin"
git init --quiet "$seed"
git -C "$seed" config user.name "release source test"
git -C "$seed" config user.email "release-source-test@example.invalid"
git -C "$seed" checkout -b v-next >/dev/null 2>&1
printf 'release candidate\n' > "$seed/package.txt"
git -C "$seed" add package.txt
git -C "$seed" commit --quiet -m "release candidate"
candidate="$(git -C "$seed" rev-parse HEAD)"
git -C "$seed" remote add origin "$origin"
git -C "$seed" push --quiet origin v-next
git --git-dir="$origin" symbolic-ref HEAD refs/heads/v-next

git -C "$seed" tag v-light-ok "$candidate"
git -C "$seed" tag -a v-annotated-ok -m "annotated release" "$candidate"

git -C "$seed" checkout -b mismatch >/dev/null 2>&1
printf 'different commit\n' >> "$seed/package.txt"
git -C "$seed" commit --quiet -am "different commit"
mismatch="$(git -C "$seed" rev-parse HEAD)"
git -C "$seed" tag v-light-mismatch "$mismatch"
git -C "$seed" tag -a v-annotated-mismatch -m "annotated mismatch" "$mismatch"
git -C "$seed" push --quiet origin \
  refs/tags/v-light-ok \
  refs/tags/v-annotated-ok \
  refs/tags/v-light-mismatch \
  refs/tags/v-annotated-mismatch

reset_branch() {
  git --git-dir="$origin" update-ref refs/heads/v-next "$candidate"
}

new_runner() {
  runner_name="$1"
  runner_head="$2"
  runner="$temp_root/$runner_name"
  git clone --quiet --no-tags "$origin" "$runner"
  git -C "$runner" checkout --quiet --detach "$runner_head"
  printf '%s\n' "$runner"
}

expect_pass() {
  case_name="$1"
  release_tag="$2"
  release_target="$3"
  runner_head="$4"
  reset_branch
  runner="$(new_runner "$case_name" "$runner_head")"
  (
    cd "$runner"
    RELEASE_TAG="$release_tag" \
      RELEASE_TARGET_COMMITISH="$release_target" \
      bash "$guard"
  ) > "$temp_root/$case_name.log" 2>&1
}

expect_fail() {
  case_name="$1"
  release_tag="$2"
  release_target="$3"
  runner_head="$4"
  reset_branch
  runner="$(new_runner "$case_name" "$runner_head")"
  if (
    cd "$runner"
    RELEASE_TAG="$release_tag" \
      RELEASE_TARGET_COMMITISH="$release_target" \
      bash "$guard"
  ) > "$temp_root/$case_name.log" 2>&1; then
    printf 'expected guard failure for %s\n' "$case_name" >&2
    exit 1
  fi
}

expect_pass lightweight-positive v-light-ok "$candidate" "$candidate"
expect_pass annotated-positive v-annotated-ok "$candidate" "$candidate"
expect_fail malformed-target v-light-ok v-next "$candidate"
expect_fail tag-mismatch v-light-mismatch "$candidate" "$candidate"
expect_fail detached-head-mismatch v-light-ok "$candidate" "$mismatch"

git --git-dir="$origin" update-ref refs/heads/v-next "$mismatch"
runner="$(new_runner branch-mismatch "$candidate")"
if (
  cd "$runner"
  RELEASE_TAG=v-light-ok RELEASE_TARGET_COMMITISH="$candidate" bash "$guard"
) > "$temp_root/branch-mismatch.log" 2>&1; then
  printf 'expected guard failure for branch-mismatch\n' >&2
  exit 1
fi

expect_fail annotated-tag-mismatch v-annotated-mismatch "$candidate" "$candidate"

# Prove that the exact post-publication push is non-force and rejects a branch
# advance that occurs after a successful identity guard.
reset_branch
runner="$(new_runner branch-advance "$candidate")"
(
  cd "$runner"
  RELEASE_TAG=v-light-ok RELEASE_TARGET_COMMITISH="$candidate" bash "$guard"
  git config user.name "release runner"
  git config user.email "release-runner@example.invalid"
  printf 'version bump\n' >> package.txt
  git commit --quiet -am "version bump"
)

concurrent="$temp_root/concurrent"
git clone --quiet --no-tags "$origin" "$concurrent"
git -C "$concurrent" config user.name "concurrent writer"
git -C "$concurrent" config user.email "concurrent-writer@example.invalid"
printf 'concurrent advance\n' >> "$concurrent/package.txt"
git -C "$concurrent" commit --quiet -am "concurrent advance"
concurrent_commit="$(git -C "$concurrent" rev-parse HEAD)"
git -C "$concurrent" push --quiet origin HEAD:refs/heads/v-next

if git -C "$runner" push origin HEAD:refs/heads/v-next \
  > "$temp_root/branch-advance-push.log" 2>&1; then
  printf 'expected non-fast-forward release push rejection\n' >&2
  exit 1
fi
test "$(git --git-dir="$origin" rev-parse refs/heads/v-next)" = "$concurrent_commit"

printf 'release source guard matrix passed: 2 positives, 5 mismatch negatives, 1 non-fast-forward race\n'
