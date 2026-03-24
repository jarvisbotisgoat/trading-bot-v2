import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-[#21262d] bg-[#161b22] p-4 ${className}`}
    >
      {children}
    </div>
  );
}
