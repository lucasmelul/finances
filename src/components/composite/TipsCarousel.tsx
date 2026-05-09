import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { TipCard } from '@/lib/tips';

interface TipsCarouselProps {
  tips: TipCard[];
  className?: string;
}

const INTERVAL_MS = 5500;

export function TipsCarousel({ tips, className }: TipsCarouselProps) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [animDir, setAnimDir] = useState<'left' | 'right'>('left');
  const [visible, setVisible] = useState(true);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = (next: number, dir: 'left' | 'right' = 'left') => {
    if (next === idx) return;
    setAnimDir(dir);
    setVisible(false);
    setTimeout(() => {
      setIdx(next);
      setVisible(true);
    }, 200);
  };

  const advance = () => {
    const next = (idx + 1) % tips.length;
    goTo(next, 'left');
  };

  useEffect(() => {
    if (paused || tips.length <= 1) return;
    timerRef.current = setInterval(advance, INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [idx, paused, tips.length]);

  if (!tips.length) return null;

  const tip = tips[idx];

  return (
    <div
      className={cn('select-none', className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Card */}
      <div
        className="rounded-2xl border border-border-subtle bg-bg-surface overflow-hidden"
        style={{ borderLeft: `3px solid ${tip.accent}` }}
      >
        <div
          className="p-4"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible
              ? 'translateX(0)'
              : animDir === 'left' ? 'translateX(-8px)' : 'translateX(8px)',
            transition: 'opacity 200ms ease, transform 200ms ease',
          }}
        >
          {/* Tag */}
          <div className="mb-2 flex items-center justify-between">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: `${tip.accent}22`, color: tip.accent }}
            >
              {tip.tag}
            </span>
            <span className="text-[10px] text-text-muted tabular-nums">
              {idx + 1}/{tips.length}
            </span>
          </div>

          {/* Title */}
          <div className="mb-1 text-[14px] font-semibold leading-snug text-text-primary">
            {tip.title}
          </div>

          {/* Body */}
          <div className="text-[12px] leading-relaxed text-text-secondary">
            {tip.body}
          </div>

          {/* CTA */}
          {tip.cta && (
            <button
              type="button"
              onClick={() => navigate(tip.cta!.path)}
              className="mt-3 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-80"
              style={{ background: `${tip.accent}22`, color: tip.accent }}
            >
              {tip.cta.label} →
            </button>
          )}
        </div>
      </div>

      {/* Dot indicators */}
      {tips.length > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {tips.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Tip ${i + 1}`}
              onClick={() => goTo(i, i > idx ? 'left' : 'right')}
              className="rounded-full transition-all"
              style={{
                width: i === idx ? 16 : 5,
                height: 5,
                background: i === idx ? tip.accent : 'hsl(var(--border-hover))',
                transition: 'width 300ms ease, background 300ms ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
