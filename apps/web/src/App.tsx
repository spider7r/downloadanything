import {
  Download,
  FastForward,
  FolderDown,
  ListChecks,
  Monitor,
  MousePointerClick,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import Downloader from "./components/Downloader";
import PlatformIcon from "./components/PlatformIcon";
import { PLATFORMS } from "./lib/platforms";

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
          <a href="#how" className="hover:text-white">How it works</a>
          <a href="#supported" className="hover:text-white">Supported sites</a>
          <a href="#windows" className="hover:text-white">Windows app</a>
          <a href="#faq" className="hover:text-white">FAQ</a>
        </nav>
        <a
          href="#downloader"
          className="rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Start downloading
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pt-16 pb-10 text-center sm:pt-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.25),transparent_60%)]"
      />
      <div className="relative mx-auto max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-sm font-medium text-indigo-300">
          <FastForward className="h-4 w-4" /> Powered by yt-dlp — engines update automatically
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
          Download <span className="text-gradient">Anything</span>.
          <br />
          From anywhere.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-400">
          Free, fast, no-signup downloader for videos & audio from YouTube, TikTok, Instagram,
          X and thousands of other sites.
        </p>
      </div>
      <div className="relative mt-14">
        <Downloader />
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    icon: MousePointerClick,
    title: "Paste the link",
    text: "Copy any video URL — we auto-detect the platform instantly.",
  },
  {
    n: "02",
    icon: SlidersHorizontal,
    title: "Choose your quality",
    text: "Pick any resolution up to 4K, or extract the audio as MP3.",
  },
  {
    n: "03",
    icon: FolderDown,
    title: "Save the file",
    text: "Watch live progress — the browser saves the finished file automatically.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
      <h2 className="text-center text-3xl font-bold text-white">How it works</h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
        Three steps. No signup, no ads-wall, no waiting rooms.
      </p>
      <div className="relative mt-12 grid gap-6 md:grid-cols-3">
        {/* connector line */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-12 right-[16%] left-[16%] hidden border-t-2 border-dashed border-zinc-800 md:block"
        />
        {STEPS.map(({ n, icon: Icon, title, text }) => (
          <div
            key={n}
            className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition duration-300 hover:-translate-y-1.5 hover:border-zinc-600 hover:shadow-xl hover:shadow-indigo-500/5"
          >
            {/* giant watermark number */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-7 right-0 bg-gradient-to-b from-zinc-700/40 to-transparent bg-clip-text text-[7rem] leading-none font-black text-transparent select-none"
            >
              {n}
            </span>
            {/* gradient icon tile */}
            <div className="relative grid h-13 w-13 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 shadow-lg shadow-indigo-500/30 transition duration-300 group-hover:scale-110 group-hover:rotate-3">
              <Icon className="h-6 w-6 text-white" />
            </div>
            <h3 className="relative mt-5 text-lg font-bold text-white">{title}</h3>
            <p className="relative mt-2 text-sm text-zinc-400">{text}</p>
            {/* bottom accent line */}
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-indigo-500 to-fuchsia-500 opacity-0 transition duration-300 group-hover:opacity-100" />
          </div>
        ))}
      </div>
    </section>
  );
}

function SupportedGrid() {
  return (
    <section id="supported" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
      <h2 className="text-center text-3xl font-bold text-white">Thousands of supported sites</h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
        Powered by <span className="text-zinc-200">yt-dlp</span>, the engine behind every serious
        downloader. If it can be downloaded, we can do it.
      </p>
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
        {PLATFORMS.map((p) => (
          <div
            key={p.key}
            style={{ ["--brand" as string]: p.color }}
            className="plat-card group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition duration-300 hover:-translate-y-0.5 hover:bg-zinc-900"
          >
            <span className="plat-logo grid h-8 w-8 shrink-0 place-items-center text-zinc-500 transition-all duration-300">
              <PlatformIcon platformKey={p.key} className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
            </span>
            <span className="truncate text-sm font-semibold text-zinc-300 group-hover:text-white">{p.name}</span>
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
    title: "Direct file delivery",
    text: "Files stream straight to your browser. We never store your videos.",
  },
  {
    icon: ShieldCheck,
    title: "No signup, no tracking",
    text: "Paste a link, pick a quality, done. No accounts, no email.",
  },
  {
    icon: ListChecks,
    title: "Every format, up to 4K",
    text: "All available resolutions and audio formats — clearly grouped, one click to start.",
  },
  {
    icon: Monitor,
    title: "Windows desktop app",
    text: "Queue playlists, convert to MP3 and manage a library with our native app.",
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 pb-16">
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
    <section id="windows" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-20">
      <div className="glow relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-indigo-950/60 via-zinc-950 to-fuchsia-950/40 p-10 text-center sm:p-14">
        <Monitor className="mx-auto h-8 w-8 text-fuchsia-400" />
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
    a: "Yes — switch to the Audio tab after a link is detected: grab MP3 (converted) or the original audio stream.",
  },
  {
    q: "Do you store my files or data?",
    a: "No. Files stream directly to your browser and are deleted immediately after delivery. No accounts, no data selling.",
  },
  {
    q: "Is this legal?",
    a: "Downloading content you own or that is freely provided is fine. You are responsible for respecting each platform's Terms of Service and applicable copyright law — for example, don't re-upload creators' work without permission.",
  },
];

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-24">
      <h2 className="mb-8 text-center text-3xl font-bold text-white">FAQ</h2>
      <div className="space-y-3">
        {FAQ.map(({ q, a }) => (
          <details
            key={q}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4"
          >
            <summary className="cursor-pointer list-none font-medium text-zinc-100 [&::-webkit-details-marker]:hidden">
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
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 text-center">
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
      <Hero />
      <HowItWorks />
      <Features />
      <SupportedGrid />
      <WindowsApp />
      <Faq />
      <Footer />
    </div>
  );
}
