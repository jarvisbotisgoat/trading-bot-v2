'use client';

interface FilterBarProps {
  filters: {
    symbol: string;
    setup_type: string;
    outcome: string;
    from: string;
    to: string;
  };
  onChange: (filters: FilterBarProps['filters']) => void;
  onExport: () => void;
}

export function FilterBar({ filters, onChange, onExport }: FilterBarProps) {
  const update = (key: string, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const inputClass =
    'bg-[#0d0f14] border border-[#21262d] rounded-md px-3 py-1.5 text-sm text-white focus:border-[#00d4aa] focus:outline-none';

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <input
        type="text"
        placeholder="Symbol"
        value={filters.symbol}
        onChange={(e) => update('symbol', e.target.value.toUpperCase())}
        className={`${inputClass} w-24`}
      />
      <select
        value={filters.setup_type}
        onChange={(e) => update('setup_type', e.target.value)}
        className={inputClass}
      >
        <option value="">All Setups</option>
        <option value="ORB">ORB</option>
        <option value="VWAP_RECLAIM">VWAP Reclaim</option>
        <option value="HOD_BREAK">HOD Break</option>
      </select>
      <select
        value={filters.outcome}
        onChange={(e) => update('outcome', e.target.value)}
        className={inputClass}
      >
        <option value="">All Outcomes</option>
        <option value="win">Win</option>
        <option value="loss">Loss</option>
        <option value="breakeven">Breakeven</option>
      </select>
      <input
        type="date"
        value={filters.from}
        onChange={(e) => update('from', e.target.value)}
        className={inputClass}
      />
      <input
        type="date"
        value={filters.to}
        onChange={(e) => update('to', e.target.value)}
        className={inputClass}
      />
      <button
        onClick={onExport}
        className="ml-auto px-3 py-1.5 text-sm rounded-md border border-[#21262d] text-[#8b949e] hover:text-white hover:border-[#00d4aa] transition-colors"
      >
        Export CSV
      </button>
    </div>
  );
}
