// This is a mock for @paima/db so it doesn't get loaded in the browser.
export const getConnection = () => {
  throw new Error("getConnection is not implemented");
};