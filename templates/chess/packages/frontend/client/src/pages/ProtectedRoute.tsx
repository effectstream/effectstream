import React from "react";
import { Page } from "../MainController.ts";
import { Navigate, Outlet } from "react-router-dom";

interface Props {
  walletAddress: string;
  redirectPath?: string;
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<Props> = ({
  walletAddress,
  redirectPath = Page.Login,
  children,
}) => {
  if (!walletAddress) {
    return <Navigate to={redirectPath} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
