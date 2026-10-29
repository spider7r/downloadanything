import {
  Download,
  Github,
  FastForward,
  MonitorDown,
  ShieldCheck,
  Sparkles,
  Youtube,
} from "lucide-react";
import Downloader from "./components/Downloader";

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
        <a href="#" className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-bold tracking-tight text-white">
            Download <span className="text-gradient">Anything</span>
          </span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
          <a href="#supported" className="hover:text-white">Supported sites</a>
          <a href="#windows" className="hover:text-white">Windows app</a>
          <a href="#faq" className="hover:text-white">FAQ</a>
        </nav>
        <a
          href="#downloader"
          className="rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          Start downloading
        </a>
      </div>
    </header>
  );
}

const PLATFORMS = [
  { name: "YouTube", icon: Youtube },
  { name: "TikTok", icon: Music2 },
  { name: "Instagram", icon: InstagramIcon },
  { name: "X", icon: Twitter },
  { name: "Facebook", icon: Facebook },
  { name: "Reddit", icon: Bot },
  { name: "SoundCloud", icon: AudioLines },
  { name: "Twitch", icon: Twitch },
  { name: "Vimeo", icon: Video },
  { name: "Pinterest", icon: Pin },
];

function SupportedGrid() {
  return (
    <section id="supported" className="mx-auto max-w-6xl px-4 py-20">
      <h2 className="text-center text-3xl font-bold text-white">Thousands of supported sites</h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
        Powered by <span className="text-zinc-200">yt-dlp</span>, the engine behind every serious
        downloader. If it can be downloaded, we can do it.
      </p>
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {PLATFORMS.map(({ name, icon: Icon }) => (
          <div
            key={name}
            className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition hover:border-indigo-500/50"
          >
            {Icon && <Icon className="h-5 w-5 shrink-0 text-indigo-400" />}
            <span className="truncate text-sm font-medium text-zinc-300">{name}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-zinc-500">…and thousands more.</p>
    </section>
  );
}

const FEATURES = [
  {
    icon: Download,
    title: "Direct file downloads",
    text: "Files stream straight to your browser. We never store your videos on our servers.",
  },
  {
    icon: ShieldCheck,
    title: "No signup, no tracking",
    text: "Paste a link, pick a quality, done. No accounts, no email, no nonsense.",
  },
  {
    icon: FastForward,
    title: "Fast & lightweight",
    text: "Runs on the battle-tested yt-dlp engine with zero bloat or fake download buttons.",
  },
  {
    icon: MonitorDown,
    title: "Windows desktop app",
    text: "Queue playlists, convert to MP3 and manage a library with our native app.",
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 pb-20">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20">
              <Icon className="h-5 w-5 text-indigo-400" />
            </div>
            <h3 className="mt-4 font-semibold text-white">{title}</h3>
            <p className="mt-1.5 text-sm text-zinc-400">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WindowsApp() {
  return (
    <section id="windows" className="mx-auto max-w-6xl px-4 pb-20">
      <div className="glow relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-indigo-950/60 via-zinc-950 to-fuchsia-950/40 p-10 text-center sm:p-14">
        <Sparkles className="mx-auto h-8 w-8 text-fuchsia-400" />
        <h2 className="mt-4 text-3xl font-bold text-white">Prefer a desktop app?</h2>
        <p className="mx-auto mt-3 max-w-lg text-zinc-400">
          Get <b className="text-zinc-200">Download Anything for Windows</b> — batch playlists,
          MP3 conversion, download history and automatic engine updates.
        </p>
        <div className="mt-7 flex items-center justify-center gap-4">
          <a
            href="/downloads/DownloadAnything-Windows-Setup.exe"
            className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            <Download className="h-5 w-5" /> Download for Windows
          </a>
          <a href="#downloader" className="text-sm font-medium text-zinc-400 underline-offset-4 hover:text-white hover:underline">
            or use it online
          </a>
        </div>
        <p className="mt-4 text-xs text-zinc-600">Windows 10/11 · 64-bit · Free</p>
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: "Is Download Anything free?",
    a: "Yes — completely free, both the web downloader and the Windows app.",
  },
  {
    q: "Do I need to install anything?",
    a: "Not for the web version. Just paste a link above. The Windows app is optional.",
  },
  {
    q: "Which sites are supported?",
    a: "YouTube, TikTok, Instagram, X (Twitter), Facebook, Reddit, Twitch, SoundCloud, Vimeo and thousands more via yt-dlp.",
  },
  {
    q: "Can I download audio only?",
    a: "Yes — after a link is detected, switch to the Audio tab to grab the audio track.",
  },
  {
    q: "Do you store my files or data?",
    a: "No. Files stream directly from our server to your browser and are deleted immediately. We don't require accounts and don't sell data.",
  },
  {
    q: "Is this legal?",
    a: "Downloading content you own or that is freely provided is fine. You are responsible for respecting each platform's Terms of Service and applicable copyright law — for example, don't re-upload creators' work without permission.",
  },
];

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 pb-24">
      <h2 className="mb-8 text-center text-3xl font-bold text-white">FAQ</h2>
      <div className="space-y-3">
        {FAQ.map(({ q, a }) => (
          <details
            key={q}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4"
          >
            <summary className="cursor-pointer list-none font-medium text-zinc-100 marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between">
                {q}
                <span className="text-zinc-500 transition group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-3 text-sm text-zinc-400">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-800/80 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-6 w-6 rounded-md" />
          <span className="font-semibold text-zinc-300">
            Download <span className="text-gradient">Anything</span>
          </span>
        </div>
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-zinc-500">
          <a href="#downloader" className="hover:text-zinc-200">Downloader</a>
          <a href="#supported" className="hover:text-zinc-200">Supported sites</a>
          <a href="#windows" className="hover:text-zinc-200">Windows app</a>
          <a href="#faq" className="hover:text-zinc-200">FAQ</a>
          <a href="#" className="hover:text-zinc-200">Privacy</a>
          <a href="#" className="hover:text-zinc-200">Terms</a>
        </nav>
        <p className="max-w-2xl text-xs text-zinc-600">
          Please respect creators' rights: download only content you own or that the source
          permits. Download Anything is not affiliated with YouTube, TikTok, Instagram, X or any
          platform. Powered by open-source yt-dlp.
        </p>
        <p className="text-xs text-zinc-600">© {new Date().getFullYear()} downloadanything.online</p>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-16 pb-14 text-center sm:pt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.25),transparent_60%)]"
        />
        <div className="relative mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-sm font-medium text-indigo-300">
            <Github className="h-4 w-4" /> Powered by yt-dlp — updated automatically
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Download <span className="text-gradient">Anything</span>.
            <br />
            From anywhere.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-400">
            Free, fast, no-signup downloader for videos & audio from YouTube, TikTok,
            Instagram, X and thousands of other sites.
          </p>
        </div>
        <div className="relative mt-10">
          <Downloader />
        </div>

        {/* supported logos ticker (simplified) */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-zinc-600">
          {["YouTube", "TikTok", "Instagram", "X", "Facebook", "Reddit", "SoundCloud", "Twitch", "Vimeo"].map(
            (p) => (
              <span key={p} className="font-medium">{p}</span>
            ),
          )}
          <span>…</span>
        </div>
      </section>

      <SupportedGrid />
      <Features />
      <WindowsApp />
      <Faq />
      <Footer />
    </div>
  );
}

// Small inline icon shims to avoid extra dependencies for brand-ish icons
function Music2(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="18" r="4" /><path d="M12 18V2l7 4" />
    </svg>
  );
}
function InstagramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function Twitter(props: React.SVGProps<SVGSVGElement>) {
  return <span className="font-black text-lg leading-none">𝕏</span>;
}
function Facebook(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13 22v-8h3l.5-4H13V7.5c0-1.1.3-1.5 1.6-1.5H17V2.2S15.6 2 14.3 2C10.7 2 9 3.9 9 7.1V10H6v4h3v8z" />
    </svg>
  );
}
function Bot(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <rect x="4" y="7" width="16" height="12" rx="3" /><circle cx="9" cy="13" r="1" fill="currentColor" /><circle cx="15" cy="13" r="1" fill="currentColor" /><path d="M12 7V4" /><circle cx="12" cy="3" r="1" fill="currentColor" />
    </svg>
  );
}
function AudioLines(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <path d="M3 12h2l2-6 3 12 2-8 2 5 2-3h5" />
    </svg>
  );
}
function Twitch(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" {...props}>
      <path d="M4 3h17v11l-5 5H8l-4 3V3z" /><path d="M11 8v4M15 8v4" />
    </svg>
  );
}
function Video(props: React.SVGProps<SVGSVGElement>) {
  return <Youtube {...props} />;
}
function Pin(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <path d="M12 3a6 6 0 0 1 6 6c0 4-3 8-5.5 12L11 15a6 6 0 0 1 1-9z" transform="rotate(45 12 12)" />
    </svg>
  );
}
