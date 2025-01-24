import superjson from "superjson";

export function toString(str: unknown): string {
  if (typeof str !== "object") {
    if (typeof str === "function") {
      return str.name === "" ? "[Function]" : `[Function: ${str.name}]`;
    }
    return (String(str));
  }
  if (str instanceof Error) {
    return (`${str.name}: ${str.message}\nStack: ${str.stack}`);
  }

  try {
    return superjson.stringify(str);
  } catch (e) {
    return toString(e);
    // should not happen, but maybe there is some type that fails for some reason
  }
}
