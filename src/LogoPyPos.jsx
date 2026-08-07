// Logo de marca de PYPOS: ícono SVG + wordmark, reutilizable en toda la app
// (Login, Sidebar del Dashboard, etc.) para que el branding sea consistente
// y se pueda actualizar en un solo lugar sin tocar la lógica de cada pantalla.

export default function LogoPyPos({ variant = 'full', size = 40 }) {
    // variant: 'full' (ícono + texto) | 'icon' (solo el ícono, para el sidebar colapsado)
    return (
        <div className="flex items-center gap-2.5 select-none">
            <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                <defs>
                    <linearGradient id="pyposBadge" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#fb923c" />
                        <stop offset="1" stopColor="#c2410c" />
                    </linearGradient>
                </defs>
                <rect x="1" y="1" width="46" height="46" rx="13" fill="url(#pyposBadge)" />
                <rect x="1" y="1" width="46" height="46" rx="13" fill="none" stroke="#fff" strokeOpacity="0.15" />
                <text
                    x="19"
                    y="33"
                    fontFamily="Arial, Helvetica, sans-serif"
                    fontWeight="800"
                    fontSize="26"
                    fill="#ffffff"
                    textAnchor="middle"
                >
                    P
                </text>
                <circle cx="35" cy="34" r="9" fill="#1e1e2d" />
                <path
                    d="M31 34.2l2.6 2.6 5-5.4"
                    fill="none"
                    stroke="#fb923c"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>

            {variant === 'full' && (
                <span className="text-2xl font-black tracking-tight text-[#1e1e2d] whitespace-nowrap leading-none">
                    PY<span className="text-orange-500">POS</span>
                </span>
            )}
        </div>
    );
}
