import PlatformIcon from "./PlatformIcon";
import { PLATFORMS } from "../lib/platforms";

/**
 * Infinite horizontal ticker of platform logos.
 * The list is rendered twice for a seamless loop; pauses on hover.
 * When `activeKey` is set, that platform's card glows in its brand color.
 */
export default function LogoTicker({ activeKey }: { activeKey?: string | null }) {
  const items = [...PLATFORMS, ...PLATFORMS]; // seamless loop

  return (
    <div
      className="relative w-full overflow-hidden py-1 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
      title="Supported platforms"
    >
      <div className="flex w-max animate-ticker gap-3 hover:[animation-play-state:paused]">
        {items.map((p, i) => {
          const active = p.key === activeKey;
          return (
            <span
              key={`${p.key}-${i}`}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-4 py-2 transition-all duration-300 ${
                active
                  ? "scale-105 border-transparent"
                  : i < PLATFORMS.length
                    ? "border-zinc-800 bg-zinc-900/70"
                    : "border-zinc-800 bg-zinc-900/70"
              }`}
              style={
                active
                  ? {
                      backgroundColor: `${p.color}1f`,
                      borderColor: `${p.color}66`,
                      boxShadow: `0 0 28px -8px ${p.color}`,
                      color: p.color,
                    }
                  : undefined
              }
            >
              <span
                className="grid h-6 w-6 place-items-center"
                style={{ color: active ? p.color : "#8b8b94" }}
              >
                <PlatformIcon platformKey={p.key} className="h-5 w-5" />
              </span>
              <span
                className={`text-sm font-bold tracking-wide whitespace-nowrap ${active ? "" : "text-zinc-400"}`}
                style={active ? { color: p.color } : undefined}
              >
                {p.name}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
