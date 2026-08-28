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
git -C "$seed" config user.name 'release source test'
git -C "$seed" config user.email 'release-source-test@example.invalid'

git -C "$seed" checkout -b midnight-1 >/dev/null 2>&1
printf 'midnight node 1\n' > "$seed/package.txt"
git -C "$seed" add package.txt
git -C "$seed" commit --quiet -m 'maintenance candidate'
maintenance="$(git -C "$seed" rev-parse HEAD)"
git -C "$seed" tag v0.104.2 "$maintenance"
git -C "$seed" tag -a v0.104.3 -m maintenance-annotated "$maintenance"

git -C "$seed" checkout --orphan v-next >/dev/null 2>&1
git -C "$seed" rm -rf --quiet .
printf 'midnight node 2\n' > "$seed/package.txt"
git -C "$seed" add package.txt
git -C "$seed" commit --quiet -m 'node2 candidate'
node2="$(git -C "$seed" rev-parse HEAD)"
git -C "$seed" tag v0.200.3 "$node2"
git -C "$seed" tag -a v0.200.4 -m node2-annotated "$node2"
git -C "$seed" tag v0.200.5-rc.1 "$node2"
git -C "$seed" remote add origin "$origin"
git -C "$seed" push --quiet origin midnight-1 v-next --tags
git --git-dir="$origin" symbolic-ref HEAD refs/heads/v-next

new_runner() {
  local name="$1" head="$2"
  local runner="$temp_root/$name"
  git clone --quiet --no-tags "$origin" "$runner"
  git -C "$runner" checkout --quiet --detach "$head"
  printf '%s\n' "$runner"
}

expect_pass() {
  local name="$1" tag="$2" target="$3" head="$4" prerelease="$5" branch="$6" dist_tag="$7"
  local runner output
  runner="$(new_runner "$name" "$head")"
  output="$temp_root/$name.outputs"
  (
    cd "$runner"
    RELEASE_TAG="$tag" RELEASE_TARGET_COMMITISH="$target" RELEASE_PRERELEASE="$prerelease" \
      GITHUB_OUTPUT="$output" bash "$guard"
  ) > "$temp_root/$name.log" 2>&1
  grep -qx "branch=$branch" "$output"
  grep -qx "dist-tag=$dist_tag" "$output"
  grep -qx "source-sha=$target" "$output"
}

expect_fail() {
  local name="$1" tag="$2" target="$3" head="$4" prerelease="$5"
  local runner output
  runner="$(new_runner "$name" "$head")"
  output="$temp_root/$name.outputs"
  if (
    cd "$runner"
    RELEASE_TAG="$tag" RELEASE_TARGET_COMMITISH="$target" RELEASE_PRERELEASE="$prerelease" \
      GITHUB_OUTPUT="$output" bash "$guard"
  ) > "$temp_root/$name.log" 2>&1; then
    printf 'expected guard failure for %s\n' "$name" >&2
    exit 1
  fi
  test ! -s "$output"
}

expect_pass maintenance-light v0.104.2 "$maintenance" "$maintenance" false midnight-1 midnight-1
expect_pass maintenance-annotated v0.104.3 "$maintenance" "$maintenance" false midnight-1 midnight-1
expect_pass node2-light v0.200.3 "$node2" "$node2" false v-next latest
expect_pass node2-annotated v0.200.4 "$node2" "$node2" false v-next latest
expect_pass node2-prerelease v0.200.5-rc.1 "$node2" "$node2" true v-next next

expect_fail swapped-maintenance v0.104.2 "$node2" "$node2" false
expect_fail swapped-node2 v0.200.3 "$maintenance" "$maintenance" false
expect_fail metadata-stable v0.200.3 "$node2" "$node2" true
expect_fail metadata-prerelease v0.200.5-rc.1 "$node2" "$node2" false
expect_fail maintenance-prerelease v0.104.3-rc.1 "$maintenance" "$maintenance" true
expect_fail build-metadata v0.200.3+build.1 "$node2" "$node2" false
expect_fail unsupported-low v0.103.999 "$node2" "$node2" false
expect_fail unsupported-high v0.201.0 "$node2" "$node2" false
expect_fail leading-zero v0.0200.3 "$node2" "$node2" false
expect_fail prerelease-leading-zero v0.200.3-rc.01 "$node2" "$node2" true
expect_fail malformed-tag release-0.200.3 "$node2" "$node2" false
expect_fail short-target v0.200.3 "${node2:0:12}" "$node2" false
expect_fail uppercase-target v0.200.3 "$(tr '[:lower:]' '[:upper:]' <<< "$node2")" "$node2" false
expect_fail head-mismatch v0.200.3 "$node2" "$maintenance" false

# Missing mapped branch and fresh branch advance both fail with empty outputs.
git --git-dir="$origin" update-ref -d refs/heads/midnight-1
expect_fail missing-branch v0.104.2 "$maintenance" "$maintenance" false
git --git-dir="$origin" update-ref refs/heads/midnight-1 "$maintenance"
git --git-dir="$origin" update-ref refs/heads/v-next "$maintenance"
expect_fail stale-branch-head v0.200.3 "$node2" "$node2" false
git --git-dir="$origin" update-ref refs/heads/v-next "$node2"

race_branch() {
  local branch="$1" tag="$2" target="$3" prerelease="$4" name="$5"
  local runner concurrent
  runner="$(new_runner "$name-runner" "$target")"
  (
    cd "$runner"
    RELEASE_TAG="$tag" RELEASE_TARGET_COMMITISH="$target" RELEASE_PRERELEASE="$prerelease" bash "$guard"
    git config user.name runner
    git config user.email runner@example.invalid
    printf 'version\n' >> package.txt
    git commit --quiet -am version
  )
  concurrent="$(new_runner "$name-concurrent" "$target")"
  git -C "$concurrent" config user.name concurrent
  git -C "$concurrent" config user.email concurrent@example.invalid
  printf 'advance\n' >> "$concurrent/package.txt"
  git -C "$concurrent" commit --quiet -am advance
  git -C "$concurrent" push --quiet origin "HEAD:refs/heads/$branch"
  if git -C "$runner" push origin "HEAD:refs/heads/$branch" > "$temp_root/$name-push.log" 2>&1; then
    printf 'expected non-fast-forward race rejection for %s\n' "$branch" >&2
    exit 1
  fi
}

race_branch v-next v0.200.3 "$node2" false node2-race
git --git-dir="$origin" update-ref refs/heads/midnight-1 "$maintenance"
race_branch midnight-1 v0.104.2 "$maintenance" false maintenance-race

printf 'release source guard matrix passed: 5 positives, 16 fail-closed negatives, 2 non-fast-forward races\n'
