import { useEffect, useRef } from 'react';

export type BootPhase = 'cover' | 'data' | 'scene' | 'layout' | 'leave' | 'done';

const STAGE: Record<Exclude<BootPhase, 'done'>, string> = {
  cover: '正在讀取圖資料',
  data: '圖資料已讀取',
  scene: '3D 場景已建立',
  layout: '正在排版節點',
  leave: '第一輪排版結束',
};

type BootScreenProps = {
  title: string;
  phase: Exclude<BootPhase, 'done'>;
  progress: number;
  onExited: () => void;
};

export default function BootScreen({ title, phase, progress, onExited }: BootScreenProps) {
  const leaving = phase === 'leave';
  const exited = useRef(false);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    if (leaving) return;
    const block = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const types = ['keydown', 'keyup', 'keypress', 'wheel', 'contextmenu'] as const;
    for (const type of types) window.addEventListener(type, block, true);
    return () => {
      for (const type of types) window.removeEventListener(type, block, true);
    };
  }, [leaving]);

  useEffect(() => {
    if (!leaving) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(() => {
      if (exited.current) return;
      exited.current = true;
      onExitedRef.current();
    }, reduceMotion ? 0 : 560);
    return () => window.clearTimeout(id);
  }, [leaving]);

  const width = Math.max(0, Math.min(100, progress));

  return (
    <div className={leaving ? 'boot-screen is-leaving' : 'boot-screen'} role="status" aria-live="polite" aria-busy={!leaving}>
      <div className="boot-stars" aria-hidden="true" />
      <div className="boot-card">
        <p className="boot-kicker">生態腦圖</p>
        <h1 className="boot-title">{title}</h1>
        <p className="boot-status">
          <span className="boot-pulse" aria-hidden="true" />
          載入中
        </p>
        <div
          className={leaving ? 'boot-track' : 'boot-track is-busy'}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={width}
          aria-valuetext={`${STAGE[phase]} ${width}%`}
        >
          <i style={{ width: `${width}%` }} />
        </div>
        <p className="boot-meta">
          <span>{STAGE[phase]}</span>
          <span>{width}%</span>
        </p>
      </div>
    </div>
  );
}
