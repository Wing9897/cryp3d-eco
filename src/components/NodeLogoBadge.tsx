import { memo, useEffect, useMemo, useState } from 'react';
import type { GraphNode } from '../types';
import { getLogoStamp, subscribeLogoStamp } from '../graph/logoStamp';
import { getNodeLogoUrl, getNodeMonogram } from '../graph/palette';
import { logoSubjectIsNearWhite, subscribeNodeLogo } from '../graph/visuals';

export type NodeLogoBadgeProps = {
  node: GraphNode;
  size?: number;
};

const NodeLogoBadge = memo(function NodeLogoBadge({
  node,
  size = 18,
}: NodeLogoBadgeProps) {
  const [logoReady, setLogoReady] = useState(false);
  const [lightLogo, setLightLogo] = useState(false);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [stamp, setStamp] = useState(getLogoStamp);
  const logoUrl = useMemo(() => getNodeLogoUrl(node), [node, stamp]);
  const monogram = useMemo(() => getNodeMonogram(node), [node]);

  useEffect(() => subscribeLogoStamp(() => setStamp(getLogoStamp())), []);

  useEffect(() => {
    setLogoReady(false);
    setLightLogo(false);
    if (!logoUrl) {
      return;
    }
    let alive = true;
    const unsubscribe = subscribeNodeLogo(
      logoUrl,
      (img) => {
        if (!alive) return;
        setLightLogo(logoSubjectIsNearWhite(img));
        setLogoReady(true);
      },
      () => {
        if (!alive) return;
        setLightLogo(false);
        setLogoReady(false);
      },
    );
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [logoUrl]);

  if (logoUrl && logoReady && blockedUrl !== logoUrl) {
    return (
      <span
        className={lightLogo ? 'merchant-logo-wrap is-light-logo' : 'merchant-logo-wrap'}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <img
          key={logoUrl}
          src={logoUrl}
          alt=""
          width={size - 2}
          height={size - 2}
          decoding="async"
          onError={() => setBlockedUrl(logoUrl)}
        />
      </span>
    );
  }

  return (
    <span
      className="merchant-monogram"
      style={{
        width: size,
        height: size,
        background: monogram.bg,
        color: monogram.fg,
        fontSize: Math.max(9, Math.floor(size * 0.48)),
      }}
      aria-hidden="true"
    >
      {monogram.text}
    </span>
  );
});

export default NodeLogoBadge;
