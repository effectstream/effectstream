import { format } from "date-fns";
import React from "react";

export type UseStateResponse<T> = [T, React.Dispatch<React.SetStateAction<T>>];

export const formatDate = (dateISO: string): string => {
  const date = new Date(dateISO);
  return format(date, "yyyy-MM-dd, HH:mm:ss");
};
