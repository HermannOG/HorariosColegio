export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="px-10 pt-10 pb-6 flex items-start justify-between gap-6 border-b border-ink-100">
      <div>
        <h2 className="font-display text-3xl text-ink-950">{title}</h2>
        {subtitle && <p className="mt-1.5 text-ink-500 text-sm max-w-xl">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-sage-700 text-white hover:bg-sage-800',
    secondary: 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50',
    danger: 'bg-white text-clay-700 border border-clay-200 hover:bg-clay-50',
    ghost: 'text-ink-500 hover:bg-ink-100',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white border border-ink-100 rounded-lg ${className}`}>
      {children}
    </div>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink-700 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-400 mt-1">{hint}</span>}
    </label>
  )
}

export function Input(props) {
  return (
    <input
      className="w-full px-3 py-2 rounded-md border border-ink-200 text-sm text-ink-900 placeholder:text-ink-300 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 outline-none"
      {...props}
    />
  )
}

export function Select({ children, ...props }) {
  return (
    <select
      className="w-full px-3 py-2 rounded-md border border-ink-200 text-sm text-ink-900 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 outline-none bg-white"
      {...props}
    >
      {children}
    </select>
  )
}

export function Pill({ children, tone = 'ink', onClick, active }) {
  const tones = {
    ink: active ? 'bg-ink-700 text-white border-ink-700' : 'bg-white text-ink-600 border-ink-200 hover:border-ink-400',
    sage: active ? 'bg-sage-600 text-white border-sage-600' : 'bg-white text-sage-700 border-sage-200 hover:border-sage-400',
    clay: active ? 'bg-clay-500 text-white border-clay-500' : 'bg-white text-clay-700 border-clay-200 hover:border-clay-400',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <p className="font-display text-lg text-ink-700 mb-1">{title}</p>
      <p className="text-sm text-ink-400 max-w-sm mb-4">{description}</p>
      {action}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-ink-200 border-t-sage-600 rounded-full animate-spin" />
    </div>
  )
}
