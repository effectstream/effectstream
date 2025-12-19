import { Container } from "@mui/material";
import clsx from "clsx";
import * as React from "react";
import "./Wrapper.scss";

interface WrapperProps extends React.HTMLProps<HTMLDivElement> {
  children?: React.ReactNode;
  small?: boolean;
  blurred?: boolean;
}

const Wrapper: React.FC<WrapperProps> = ({
  children,
  className,
  small,
  blurred = true,
  ...props
}) => {
  return (
    <Container maxWidth={small ? "sm" : "xl"}>
      <div
        className={clsx("wrapper", blurred && "wrapper--blurred", className)}
        {...props}
      >
        {children}
      </div>
    </Container>
  );
};

export default Wrapper;
