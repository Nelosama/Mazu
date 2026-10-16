import { cn } from '@/lib/cn';

export function Avatar({
  name,
  url,
  size = 'md',
  any,
}: {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg';
  any?: boolean;
}) {
  const dims = { sm: 'h-8 w-8 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-20 w-20 text-xl' }[size];
  if (url)
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className={cn(dims, 'shrink-0 rounded-full object-cover')}
      />
    );
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className={cn(
        dims,
        'flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-ink',
      )}
      aria-hidden
    >
      {any ? (
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            d="M17 20h5v-2a3 3 0 0 0-5.36-1.86M17 20H7m10 0v-2c0-.66-.13-1.28-.36-1.86M7 20H2v-2a3 3 0 0 1 5.36-1.86M7 20v-2c0-.66.13-1.28.36-1.86m0 0a5 5 0 0 1 9.28 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        initials
      )}
    </div>
  );
}
