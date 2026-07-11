import {useEffect, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {useBlogPost} from '@docusaurus/plugin-content-blog/client';
import {useDateTimeFormat} from '@docusaurus/theme-common/internal';
import styles from './styles.module.css';

interface GameEmbedProps {
  slug: string;
  title: string;
  src?: string;
  /**
   * Iframe pixel width before CSS scaling. The game inside sees this
   * width and picks its internal render scale from it.
   *
   * Defaults to 1440 (good for desktop games that resize naturally).
   * Tune per game when the engine uses integer zoom factors:
   *  - Kachina (native 480×360): use multiples of 480, e.g. 1440 → 3x
   *  - Dust to Dust (native 720×480): use multiples of 720, e.g. 1440 → 2x
   */
  virtualWidth?: number;
  /** Iframe pixel height before CSS scaling. Default 1008 (10:7 with 1440 wide). */
  virtualHeight?: number;
}

// useLayoutEffect on the server logs a React warning; swap to useEffect there.
const useIsoLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Extra pixels added to the iframe on both axes so its native scrollbars
// land outside the stage's clipping area. 24px covers all common platforms
// (macOS overlay = 0; Windows/Linux ~16-18px; Windows classic up to 22px).
const SCROLLBAR_PAD = 24;

function PostDate(): ReactNode {
  const {metadata} = useBlogPost();
  const dateTimeFormat = useDateTimeFormat({
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <time className={styles.date} dateTime={metadata.date}>
      {dateTimeFormat.format(new Date(metadata.date))}
    </time>
  );
}

export default function GameEmbed({
  slug,
  title,
  src,
  virtualWidth = 1440,
  virtualHeight = 1008,
}: GameEmbedProps): ReactNode {
  const frameSrc = src ?? `https://example.com/games/${slug}`;
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useIsoLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (!w) return;
      // Width-driven scale; height follows from the stage's aspect-ratio.
      setScale(w / virtualWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [virtualWidth, virtualHeight]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>
        <span className={styles.labelLeft}>
          <span className={styles.labelTitle}>{title}</span>
          <span className={styles.labelDot}>·</span>
          <span className={styles.labelKind}>Live demonstration</span>
        </span>
        <span className={styles.labelRight}>
          <span className={styles.labelStatus}>● PLAYABLE</span>
          <span className={styles.labelDot}>·</span>
          <span className={styles.labelStatus}><PostDate /></span>
        </span>
      </div>
      <div
        ref={stageRef}
        className={styles.stage}
        style={{aspectRatio: `${virtualWidth} / ${virtualHeight}`}}>
        <iframe
          src={frameSrc}
          title={`${title} game`}
          className={styles.frame}
          // Oversize by SCROLLBAR_PAD on both axes so the iframe's native
          // scrollbars land outside the .stage clipping rect (which has
          // overflow: hidden + the original aspect ratio). scrolling="no"
          // is deprecated but still helps in older browsers.
          style={{
            width: `${virtualWidth + SCROLLBAR_PAD}px`,
            height: `${virtualHeight + SCROLLBAR_PAD}px`,
            transform: `scale(${scale})`,
          }}
          scrolling="no"
          allow="fullscreen"
        />
      </div>
      <div className={styles.caption}>
        <span className={styles.captionLeft}>click frame to play</span>
        <span className={styles.captionRight}>how it was built ↓</span>
      </div>
    </div>
  );
}
