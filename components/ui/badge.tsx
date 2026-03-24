interface BadgeProps {
  label: string;
  variant?: 'green' | 'red' | 'yellow' | 'gray';
  pulse?: boolean;
}

const colors = {
  green: 'bg-[#00d4aa]/20 text-[#00d4aa] border-[#00d4aa]/30',
  red: 'bg-[#ff4d4f]/20 text-[#ff4d4f] border-[#ff4d4f]/30',
  yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  gray: 'bg-gray-500/20 text-[#8b949e] border-gray-500/30',
};

export function Badge({ label, variant = 'gray', pulse = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[variant]}`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
              variant === 'green' ? 'bg-[#00d4aa]' : variant === 'red' ? 'bg-[#ff4d4f]' : 'bg-yellow-400'
            }`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              variant === 'green' ? 'bg-[#00d4aa]' : variant === 'red' ? 'bg-[#ff4d4f]' : 'bg-yellow-400'
            }`}
          />
        </span>
      )}
      {label}
    </span>
  );
}
