import React, {useEffect, useRef, useState, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import {useThemeConfig} from '@docusaurus/theme-common';
import type {Props} from '@theme/Mermaid';
import type {RenderResult, MermaidConfig} from 'mermaid';

function MermaidDiagram({value}: Props): ReactNode {
  const [result, setResult] = useState<RenderResult | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const themeConfig = useThemeConfig() as any;
  const mermaidThemeConfig = themeConfig.mermaid;
  const theme = mermaidThemeConfig.theme.dark;

  useEffect(() => {
    const config: MermaidConfig = {
      startOnLoad: false,
      ...mermaidThemeConfig.options,
      theme,
    };
    const id = `mermaid-svg-${Math.round(Math.random() * 10000000)}`;

    import('mermaid').then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize(config);
      mermaid
        .render(id, value)
        .then((r) => setResult(r))
        .catch((e) => {
          document.querySelector(`#d${id}`)?.remove();
          console.error('Mermaid render error:', e);
        });
    });
  }, [value, theme, mermaidThemeConfig.options]);

  useEffect(() => {
    if (result && ref.current) {
      result.bindFunctions?.(ref.current);
    }
  }, [result]);

  if (!result) return null;

  return (
    <div
      ref={ref}
      className="docusaurus-mermaid-container"
      dangerouslySetInnerHTML={{__html: result.svg}}
    />
  );
}

export default function Mermaid(props: Props): ReactNode {
  return (
    <BrowserOnly fallback={<div>Loading diagram...</div>}>
      {() => <MermaidDiagram {...props} />}
    </BrowserOnly>
  );
}
