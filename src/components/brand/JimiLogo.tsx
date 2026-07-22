import type { CSSProperties } from 'react';

/**
 * JIMI AI 品牌标识 —— Soft Pebble。
 *
 * 一颗略宽的圆润橙色「鹅卵石」，配两颗不对称的深色眼睛
 * （左眼略大且略高）。不含任何动物五官、渐变、
 * 阴影或动态表情。颜色通过 CSS 自定义属性 token 化，
 * 在浅色 / 深色表面上均保持对比度。
 */

export interface JimiLogoProps {
  /** symbol = 仅鹅卵石标记；lockup = 标记 + JIMI AI 字标 */
  variant?: 'symbol' | 'lockup';
  /** 标记宽度（px），应用内最小 24 */
  size?: number;
  /** 可访问名称 */
  label?: string;
  className?: string;
  title?: string;
}

const PEBBLE_FILL = 'var(--t8-brand-accent, #5f8dff)';
const EYE_FILL = 'var(--t8-brand-pebble-eye, #0f1c33)';

// 略宽的有机圆润鹅卵石轮廓（手绘贝塞尔，原创造型）
const PEBBLE_PATH =
  'M32 5.5C45.8 5.5 57.6 15.2 58.9 29.4C60.2 43.9 50.4 56.6 33.6 58.3C18.2 59.9 6.1 49.8 5.2 34.6C4.3 19.9 16.6 5.5 32 5.5Z';

export function JimiLogo({
  variant = 'symbol',
  size = 28,
  label = 'JIMI AI',
  className,
  title,
}: JimiLogoProps) {
  const markSize = Math.max(24, size);
  const mark = (
    <svg
      width={markSize}
      height={markSize}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      focusable="false"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      {title ? <title>{title}</title> : null}
      <path d={PEBBLE_PATH} fill={PEBBLE_FILL} />
      {/* 两颗不对称眼睛：左眼略大、略高 */}
      <ellipse cx={23.5} cy={27.5} rx={4.3} ry={5.6} fill={EYE_FILL} />
      <ellipse cx={41} cy={31.5} rx={3.2} ry={4.1} fill={EYE_FILL} />
    </svg>
  );

  const rootStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: variant === 'lockup' ? Math.max(6, Math.round(markSize * 0.3)) : 0,
    lineHeight: 1,
    userSelect: 'none',
  };

  return (
    <span
      data-jimi-logo=""
      data-jimi-logo-variant={variant}
      className={className}
      style={rootStyle}
      title={title}
    >
      {mark}
      {variant === 'lockup' ? (
        <span
          aria-hidden="true"
          style={{
            fontSize: Math.round(markSize * 0.54),
            fontWeight: 800,
            letterSpacing: '0.05em',
            color: 'var(--t8-text-main, currentColor)',
            whiteSpace: 'nowrap',
          }}
        >
          JIMI AI
        </span>
      ) : null}
    </span>
  );
}

export default JimiLogo;
