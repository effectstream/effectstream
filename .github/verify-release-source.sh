#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf 'release source guard failed: %s\n' "$*" >&2
  exit 1
}

release_tag="${RELEASE_TAG:-}"
release_target="${RELEASE_TARGET_COMMITISH:-}"
github_prerelease="${RELEASE_PRERELEASE:-}"

test -n "$release_tag" || fail "RELEASE_TAG is required"
[[ "$release_target" =~ ^[0-9a-f]{40}$ ]] \
  || fail "release.target_commitish must be an exact lowercase 40-character commit SHA"
[[ "$github_prerelease" == "true" || "$github_prerelease" == "false" ]] \
  || fail "RELEASE_PRERELEASE must be exactly true or false"
git check-ref-format "refs/tags/$release_tag" >/dev/null 2>&1 \
  || fail "release tag is not a valid Git tag name: $release_tag"

semver_re='^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-([0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*))?(\+([0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*))?$'
[[ "$release_tag" =~ $semver_re ]] || fail "release tag must be strict vMAJOR.MINOR.PATCH SemVer"
major="${BASH_REMATCH[1]}"
minor="${BASH_REMATCH[2]}"
patch="${BASH_REMATCH[3]}"
prerelease="${BASH_REMATCH[5]:-}"
build="${BASH_REMATCH[8]:-}"
test -z "$build" || fail "build metadata is not supported"
if [[ -n "$prerelease" ]]; then
  IFS='.' read -r -a prerelease_parts <<< "$prerelease"
  for part in "${prerelease_parts[@]}"; do
    test -n "$part" || fail "empty prerelease identifier"
    if [[ "$part" =~ ^[0-9]+$ && "$part" != "0" && "$part" == 0* ]]; then
      fail "numeric prerelease identifiers may not have leading zeroes"
    fi
  done
fi

test "$major" = "0" || fail "unsupported release major $major"
if [[ "$minor" == "104" && -z "$prerelease" ]]; then
  mapped_branch="midnight-1"
  mapped_dist_tag="midnight-1"
  mapped_kind="maintenance-stable"
  expected_prerelease="false"
elif [[ "$minor" == "200" && -z "$prerelease" ]]; then
  mapped_branch="v-next"
  mapped_dist_tag="latest"
  mapped_kind="node2-stable"
  expected_prerelease="false"
elif [[ "$minor" == "200" && -n "$prerelease" ]]; then
  mapped_branch="v-next"
  mapped_dist_tag="next"
  mapped_kind="node2-prerelease"
  expected_prerelease="true"
elif [[ "$minor" == "104" ]]; then
  fail "maintenance prereleases are not supported"
else
  fail "unsupported release family 0.$minor.x"
fi
test "$github_prerelease" = "$expected_prerelease" \
  || fail "GitHub prerelease metadata disagrees with $release_tag"

if git symbolic-ref -q HEAD >/dev/null 2>&1; then
  fail "HEAD must be detached at the immutable release commit"
fi

# Fetch exactly the policy-selected tag and branch. Neither target_commitish nor
# another event field can select a source branch or npm channel.
git fetch --force --no-tags origin \
  "+refs/tags/$release_tag:refs/tags/$release_tag" \
  "+refs/heads/$mapped_branch:refs/remotes/origin/$mapped_branch"

head_commit="$(git rev-parse --verify 'HEAD^{commit}')" \
  || fail "checked-out HEAD is not a commit"
tag_commit="$(git rev-parse --verify "refs/tags/$release_tag^{commit}")" \
  || fail "release tag does not peel to a commit: $release_tag"
branch_commit="$(git rev-parse --verify "refs/remotes/origin/$mapped_branch^{commit}")" \
  || fail "freshly fetched origin/$mapped_branch is not a commit"
for resolved_commit in "$head_commit" "$tag_commit" "$branch_commit"; do
  [[ "$resolved_commit" =~ ^[0-9a-f]{40}$ ]] \
    || fail "Git resolved a non-full commit identity: $resolved_commit"
done
test "$head_commit" = "$release_target" \
  || fail "checked-out HEAD $head_commit does not equal release target $release_target"
test "$tag_commit" = "$release_target" \
  || fail "peeled release tag $tag_commit does not equal release target $release_target"
test "$branch_commit" = "$release_target" \
  || fail "origin/$mapped_branch $branch_commit does not equal release target $release_target"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'branch=%s\n' "$mapped_branch"
    printf 'dist-tag=%s\n' "$mapped_dist_tag"
    printf 'version=%s.%s.%s%s\n' "$major" "$minor" "$patch" "${prerelease:+-$prerelease}"
    printf 'release-kind=%s\n' "$mapped_kind"
    printf 'source-sha=%s\n' "$release_target"
  } >> "$GITHUB_OUTPUT"
fi
printf 'release source guard passed: HEAD=tag=target=origin/%s=%s; dist-tag=%s\n' \
  "$mapped_branch" "$release_target" "$mapped_dist_tag"
