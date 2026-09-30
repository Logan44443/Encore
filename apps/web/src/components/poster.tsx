import Image from "next/image";

const PALETTES = [
  "from-amber-500/40 to-rose-600/40",
  "from-sky-500/40 to-indigo-600/40",
  "from-emerald-500/40 to-teal-700/40",
  "from-fuchsia-500/40 to-purple-700/40",
  "from-orange-500/40 to-red-700/40",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Poster({
  src,
  name,
  className = "",
  sizes = "160px",
  priority,
}: {
  src: string | null;
  name: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-panel-2 ${className}`}>
      {src ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes={sizes}
          className="object-cover"
          priority={priority}
          // Wikimedia throttles bursts of server-side fetches from the optimizer; browsers load it fine directly.
          unoptimized={src.includes("upload.wikimedia.org")}
        />
      ) : (
        <div
          className={`flex h-full w-full items-end bg-gradient-to-br p-2.5 ${PALETTES[hash(name) % PALETTES.length]}`}
        >
          <span className="line-clamp-3 text-xs leading-tight font-bold text-white/90">{name}</span>
        </div>
      )}
    </div>
  );
}
