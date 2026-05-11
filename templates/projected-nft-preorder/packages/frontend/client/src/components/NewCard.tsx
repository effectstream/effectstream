import React, { useState, useEffect, useRef } from "react";
import { colors, card } from "../styles.ts";

interface Props {
  id: string | number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const FADE_DURATION = 4000;

const seenIds = new Set<string | number>();

export default function NewCard({ id, children, style }: Props) {
  const isFirstRender = useRef(!seenIds.has(id));
  const [isNew, setIsNew] = useState(isFirstRender.current);

  useEffect(() => {
    if (isFirstRender.current) {
      seenIds.add(id);
      const timer = setTimeout(() => setIsNew(false), FADE_DURATION);
      return () => clearTimeout(timer);
    }
  }, [id]);

  return (
    <div
      style={{
        ...card,
        ...style,
        background: isNew ? colors.cardBgNew : colors.cardBg,
        borderColor: isNew ? colors.cardBorderNew : colors.cardBorder,
        transition: `background ${FADE_DURATION}ms ease, border-color ${FADE_DURATION}ms ease`,
      }}
    >
      {children}
    </div>
  );
}
