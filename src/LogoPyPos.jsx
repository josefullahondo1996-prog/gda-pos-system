// Logotipo oficial de PyPOS usado en el acceso y en la navegación principal.
export default function LogoPyPos({ variant = 'full', size = 40 }) {
  const compacto = variant === 'icon';
  return (
    <img
      src="/pypos-logo.png"
      alt="PyPOS"
      draggable="false"
      className="block shrink-0 object-cover"
      style={{
        width: compacto ? size : size * 3.4,
        height: size,
        objectPosition: compacto ? 'left 28%' : 'center 28%',
      }}
    />
  );
}
