import type { EventPath, UserFilledPath } from './types.ts';

/**
 * Creates an MQTT path filling in specified variables in the path
 * @param path the base MQTT path to use
 * @param args the args to fill the path.
 * - `undefined` (explicitly or omitted) variables will be treated as `+`
 * - if all trailing variables are `undefined`, it will be replaced by `#`
 */
export function fillPath<Path extends EventPath>(path: Path, args: UserFilledPath<Path>): string {
  const keys = new Set(Object.keys(args));

  const possibleArgs = path
    .map((p, index) => [p, index])
    .filter(([p, _]) => typeof p === 'object')
    .map(([_, index]) => index as number);
  const filledArgsLeft = path
    .map((p, index) => [p, index])
    .filter(([p, _]) => typeof p === 'object' && keys.has(p.name))
    .map(([_, index]) => index)
    .reverse(); // reverse as pop() is more efficient than removing from the start of the array

  let filledPath = [];

  const addLastArg = (i: number): void => {
    if (i === path.length - 1) {
      // if it's the last entry, + and # mean the same thing
      // so we just pick +
      filledPath.push('+');
    } else {
      filledPath.push('#');
    }
  };

  for (let i = 0; i < path.length; i++) {
    const entry = path[i];

    // if we've exhausted all args provided by the user
    // but there are still args we expect later in the path
    // ex:
    // 1: a/{foo}/b/{bar}, user provides just `foo` and we've already processed it
    // 2: a/{foo}, user provided nothing
    if (
      filledArgsLeft.length === 0 &&
      possibleArgs.length > 0 &&
      i < possibleArgs[possibleArgs.length - 1]
    ) {
      // if we've reached at least the first argument
      // ex: a/{foo}, we should use `a/+` instead of just `#`
      if (i >= possibleArgs[0]) {
        addLastArg(i);
        break;
      }
    }

    // 1) handle regular string types
    {
      if (typeof entry === 'string') {
        filledPath.push(path[i]);
        continue;
      }
    }
    // 2) handle arg types
    {
      // handle types left undefined despite future args being specified
      if (args[entry.name as keyof typeof args] === undefined) {
        filledPath.push('+');
      } else {
        // handle types explicitly provided
        filledPath.push(args[entry.name as keyof typeof args]);
      }

      // if we've reached the next arg the user provided a filling for
      if (filledArgsLeft.length > 0 && i === filledArgsLeft[filledArgsLeft.length - 1]) {
        filledArgsLeft.pop();
      }
    }
  }
  return filledPath.join('/');
}

/**
 * Convert our internal definition of an event path to an mqtt-pattern compatible path
 * This is useful to later deconstruct topics for pattern matching
 */
export function toPattern(path: EventPath): string {
  let result = '';
  for (let i = 0; i < path.length; i++) {
    const entry = path[i];
    if (i > 0) result += '/'; // fencepost problem

    if (typeof entry === 'string') {
      result += entry;
    } else {
      result += `+${entry.name}`;
    }
  }
  return result;
}

export function keysForPath(path: EventPath): string[] {
  return path.filter(p => typeof p !== 'string').map(p => p.name);
}
