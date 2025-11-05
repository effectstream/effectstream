/**
 * Find the left-most entry index in an array satisfying the condition
 *
 * ex: binarySearch([6,7,7,8], 7, val => val) return `1`
 */
export function binarySearch<T>(
  arr: T[],
  target: number,
  toNum: (val: T) => number,
): number | undefined {
  let low = 0;
  let high = arr.length - 1;
  let result: number | undefined = undefined; // This will hold the index of the smallest value >= target, if it exists

  if (arr.length === 0) {
    return undefined;
  }

  // if the target is smaller than all entries, just return right away
  if (target - toNum(arr[0]) <= 0) {
    return 0;
  }
  // if the target is bigger than all entries, just return right away
  if (target - toNum(arr[arr.length - 1]) > 0) {
    return undefined;
  }

  // first: find the largest index where the value is smaller than the target
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);

    const val = target - toNum(arr[mid]);
    if (val <= 0) {
      high = mid;
    } else {
      result = mid;
      low = mid + 1;
    }
  }
  // sanity check: should never happen
  if (result == null) {
    return undefined;
  }
  return result + 1;
}
