import type { CSSProperties } from "react";

/**
 * Blinko-Logo: oranges B mit Punkt auf dunkelblauem Grund (Variante „Dunkel“).
 * Das B ist als Pfad gezeichnet, damit es überall gleich aussieht.
 */
export function LogoMark({ size = 40, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Blinko"
      style={style}
    >
      <rect width="100" height="100" rx="22" fill="#202A35" />
      <path
        transform="translate(24.06 74.00) scale(0.03407 -0.03407)"
        fill="#F36B21"
        d="M1386 402Q1386 210 1242.0 105.0Q1098 0 842 0H137V1409H782Q1040 1409 1172.5 1319.5Q1305 1230 1305 1055Q1305 935 1238.5 852.5Q1172 770 1036 741Q1207 721 1296.5 633.5Q1386 546 1386 402ZM1008 1015Q1008 1110 947.5 1150.0Q887 1190 768 1190H432V841H770Q895 841 951.5 884.5Q1008 928 1008 1015ZM1090 425Q1090 623 806 623H432V219H817Q959 219 1024.5 270.5Q1090 322 1090 425Z"
      />
      <circle cx="76" cy="23" r="6" fill="#F36B21" />
    </svg>
  );
}

export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span>Blinko</span>
    </span>
  );
}
