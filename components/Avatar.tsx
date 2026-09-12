interface AvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number;
  className?: string;
  shapeSquare?: boolean;
}

function initials(name?: string | null, email?: string | null): string {
  const base = name?.trim() || email?.split("@")[0] || "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

// Deterministic accent color from the label so avatars are distinguishable.
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 40%)`;
}

export default function Avatar({
  src,
  name,
  email,
  size = 40,
  className = "",
  shapeSquare = false,
}: AvatarProps) {
  const label = name || email || "?";
  const dimension = { width: size, height: size };
  const rounded = shapeSquare ? "rounded-2xl" : "rounded-full";

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={label}
        style={dimension}
        className={`shrink-0 object-cover ${rounded} ${className}`}
      />
    );
  }

  return (
    <div
      style={{ ...dimension, background: colorFor(label) }}
      className={`flex shrink-0 items-center justify-center font-semibold text-white ${rounded} ${className}`}
    >
      <span style={{ fontSize: size * 0.38 }}>{initials(name, email)}</span>
    </div>
  );
}
