import { Card } from './card';

interface StatTileProps {
  label: string;
  value: string;
  subValue?: string;
  color?: 'green' | 'red' | 'white';
}

const textColors = {
  green: 'text-[#00d4aa]',
  red: 'text-[#ff4d4f]',
  white: 'text-white',
};

export function StatTile({ label, value, subValue, color = 'white' }: StatTileProps) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs text-[#8b949e] uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold ${textColors[color]}`}>{value}</span>
      {subValue && <span className="text-xs text-[#8b949e]">{subValue}</span>}
    </Card>
  );
}
