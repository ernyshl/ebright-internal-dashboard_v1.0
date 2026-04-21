import { getRateColor } from '../../lib/okr/utils';

export function RateBar({ value, max = 100 }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="okrRateBarWrap">
      <div className="okrRateBar" style={{ width: `${pct}%`, background: getRateColor(value) }} />
    </div>
  );
}
