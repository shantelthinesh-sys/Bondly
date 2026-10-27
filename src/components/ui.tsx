import { ReactNode } from 'react';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';
  return (
    <div className="flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="6" cy="14" r="3.5" fill="#6257F5" />
        <circle cx="22" cy="6" r="3" fill="#239B73" />
        <circle cx="22" cy="22" r="3" fill="#14213D" />
        <line x1="6" y1="14" x2="22" y2="6" stroke="#A99BF7" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="6" y1="14" x2="22" y2="22" stroke="#A99BF7" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="22" y1="6" x2="22" y2="22" stroke="#A99BF7" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className={`font-display font-bold ${text} text-navy-900 tracking-tight`}>
        Bondly
      </span>
    </div>
  );
}

export function Avatar({ src, name, size = 'md' }: { src?: string | null; name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const dim = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-16 h-16', xl: 'w-24 h-24' }[size];
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`${dim} rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center flex-shrink-0`}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-indigo-500 font-semibold">{initials || 'U'}</span>
      )}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Button({
  children,
  variant = 'primary',
  size,
  className = '',
  ...props
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variantClass = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    success: 'btn-success',
    danger: 'btn-danger',
  }[variant];
  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : size === 'lg' ? 'px-6 py-3 text-base' : '';
  return (
    <button className={`${variantClass} ${sizeClass} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Badge({ children, color = 'indigo' }: { children: ReactNode; color?: string }) {
  const cls = `badge-${color}`;
  return <span className={cls}>{children}</span>;
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 animate-fade-in">
      {icon && <div className="text-muted mb-3">{icon}</div>}
      <h3 className="text-lg font-semibold text-navy-800 mb-1">{title}</h3>
      {description && <p className="text-sm text-muted max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4">
      <div className="w-12 h-12 rounded-full bg-error-50 text-error-300 flex items-center justify-center mb-3">!</div>
      <p className="text-sm text-error-400 font-medium">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-3">Try again</button>
      )}
    </div>
  );
}

export function ScoreRing({ score, size = 60 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? '#239B73' : score >= 50 ? '#6257F5' : score >= 25 ? '#E89914' : '#70778B';
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEEBFF" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
        />
      </svg>
      <span className="absolute font-semibold text-navy-800 text-sm">{score}</span>
    </div>
  );
}

export function Modal({ open, onClose, children, title, className = '' }: { open: boolean; onClose: () => void; children: ReactNode; title?: string; className?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-elevated w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in ${className}`}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-navy-50">
            <h3 className="font-semibold text-lg">{title}</h3>
            <button onClick={onClose} className="text-muted hover:text-navy-800 text-xl leading-none">×</button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
        {subtitle && <p className="text-muted text-sm mt-1">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function Toast({ message, type = 'info' }: { message: string; type?: 'info' | 'success' | 'error' }) {
  const colors = {
    info: 'bg-navy-800',
    success: 'bg-success-400',
    error: 'bg-error-300',
  }[type];
  return (
    <div className={`fixed bottom-4 right-4 ${colors} text-white px-4 py-3 rounded-xl shadow-elevated z-50 animate-slide-in text-sm font-medium`}>
      {message}
    </div>
  );
}
