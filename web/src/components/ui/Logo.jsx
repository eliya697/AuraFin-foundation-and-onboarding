export default function Logo({ size = 36 }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00C4CC" />
            <stop offset="100%" stopColor="#00F299" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="10" fill="url(#logo-grad)" />
        <path d="M8 21l5-10 4 7 2.5-3.5L24 21" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xl font-extrabold tracking-tight text-navy" dir="ltr">
        AuraFin <span className="text-gradient">2.0</span>
      </span>
    </div>
  );
}
