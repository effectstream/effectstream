#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf 'release source guard failed: %s\n' "$*" >&2
  exit 1
}

release_tag="${RELEASE_TAG:-}"
release_target="${RELEASE_TARGET_COMMITISH:-}"

test -n "$release_tag" || fail "RELEASE_TAG is required"
git check-ref-format "refs/tags/$release_tag" >/dev/null 2>&1 \
  || fail "release tag is not a valid Git tag name: $release_tag"
[[ "$release_target" =~ ^[0-9a-f]{40}$ ]] \
  || fail "release.target_commitish must be an exact lowercase 40-character commit SHA"

if git symbolic-ref -q HEAD >/dev/null 2>&1; then
  fail "HEAD must be detached at the immutable release commit"
fi

# Refresh both identities from the authoritative remote. The explicit refspecs
# support lightweight and annotated tags while ensuring origin/v-next is fresh.
git fetch --force --no-tags origin \
  "+refs/tags/$release_tag:refs/tags/$release_tag" \
  "+refs/heads/v-next:refs/remotes/origin/v-next"

head_commit="$(git rev-parse --verify 'HEAD^{commit}')" \
  || fail "checked-out HEAD is not a commit"
tag_commit="$(git rev-parse --verify "refs/tags/$release_tag^{commit}")" \
  || fail "release tag does not peel to a commit: $release_tag"
branch_commit="$(git rev-parse --verify 'refs/remotes/origin/v-next^{commit}')" \
  || fail "freshly fetched origin/v-next is not a commit"

for resolved_commit in "$head_commit" "$tag_commit" "$branch_commit"; do
  [[ "$resolved_commit" =~ ^[0-9a-f]{40}$ ]] \
    || fail "Git resolved a non-full commit identity: $resolved_commit"
done

test "$head_commit" = "$release_target" \
  || fail "checked-out HEAD $head_commit does not equal release target $release_target"
test "$tag_commit" = "$release_target" \
  || fail "peeled release tag $tag_commit does not equal release target $release_target"
test "$branch_commit" = "$release_target" \
  || fail "origin/v-next $branch_commit does not equal release target $release_target"

printf 'release source guard passed: HEAD=tag=target=origin/v-next=%s\n' "$release_target"
