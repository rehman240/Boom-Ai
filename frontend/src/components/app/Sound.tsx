"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Pause, Volume2, VolumeX } from "lucide-react";

const MUTE_KEY = "booom.sound-muted";
const GONG_VOLUME = 0.35; // a soft bell, not an alert

/**
 * The audio guide for each major section. Every section has its own file so a recording can
 * be swapped in for one section at a time; until then they all play the same placeholder.
 */
const GUIDES: Record<string, { title: string; src: string }> = {
  overview: { title: "Overview", src: "/audio/guide/placeholder.mp3" },
  brief: { title: "Campaign brief", src: "/audio/guide/placeholder.mp3" },
  target: { title: "Identify target", src: "/audio/guide/placeholder.mp3" },
  campaign: { title: "Campaign direction", src: "/audio/guide/placeholder.mp3" },
  creative: { title: "Creative workspace", src: "/audio/guide/placeholder.mp3" },
  budget: { title: "Budget", src: "/audio/guide/placeholder.mp3" },
  conversions: { title: "Conversions", src: "/audio/guide/placeholder.mp3" },
  review: { title: "Review and export", src: "/audio/guide/placeholder.mp3" },
  settings: { title: "Settings", src: "/audio/guide/placeholder.mp3" },
};

/** "/projects/abc/target" -> "target", "/overview" -> "overview". */
export function sectionOf(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] === "projects" ? (parts[2] ?? "brief") : (parts[0] ?? "overview");
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the choice lasts until the page is closed.
  }
}

/** Sound on/off for the gong and the guides, remembered in this browser. */
export function useSoundSetting() {
  // The shell only shows the toggle after the browser has loaded the user, so reading
  // storage up front can't cause a hydration mismatch.
  const [muted, setMuted] = useState(readMuted);
  const toggle = () =>
    setMuted((m) => {
      writeMuted(!m);
      return !m;
    });
  return { muted, toggle };
}

/**
 * Rings a calm bell when the person moves into another major section. Not on the first page
 * they open, and never when sound is off. Browsers may block it until the first click, which
 * is fine: it is a nicety, not information.
 */
export function SectionGong({ section, muted }: { section: string; muted: boolean }) {
  const last = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const previous = last.current;
    last.current = section;
    if (previous === null || previous === section || muted) return;
    audio.current ??= new Audio("/audio/gong.mp3");
    audio.current.volume = GONG_VOLUME;
    audio.current.currentTime = 0;
    audio.current.play().catch(() => undefined);
  }, [section, muted]);

  return null;
}

export function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
      aria-label={muted ? "Turn section sounds on" : "Turn section sounds off"}
      aria-pressed={!muted}
      title={muted ? "Section sounds are off" : "Section sounds are on"}
    >
      {muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}

/** Floating "Audio guide" button that plays the current section's guide. */
export function AudioGuide({ section }: { section: string }) {
  const guide = GUIDES[section];
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // Moving to another section stops the previous guide.
  useEffect(() => {
    return () => {
      audio.current?.pause();
      audio.current = null;
      setPlaying(false);
    };
  }, [section]);

  if (!guide) return null;

  function toggle() {
    if (playing && audio.current) {
      audio.current.pause();
      setPlaying(false);
      return;
    }
    audio.current ??= new Audio(guide.src);
    audio.current.onended = () => setPlaying(false);
    audio.current.currentTime = 0;
    audio.current.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }

  return (
    // A round headphones button, bottom right, so it never covers the form. On the brief it
    // sits above the guide bar that phones show there.
    <button
      onClick={toggle}
      aria-label={`${playing ? "Stop audio guide" : "Play audio guide"}: ${guide.title}`}
      title={playing ? "Stop audio guide" : "Audio guide"}
      className={`fixed right-4 z-30 grid h-14 w-14 place-items-center rounded-full border border-cyan/50 bg-surface-2 text-cyan shadow-[0_8px_30px_-8px_rgba(46,200,255,0.45)] hover:bg-surface-3 lg:right-6 ${
        section === "brief" ? "bottom-28 lg:bottom-6" : "bottom-6"
      }`}
    >
      {playing ? <Pause className="h-7 w-7" aria-hidden="true" /> : <Headphones className="h-7 w-7" aria-hidden="true" />}
    </button>
  );
}
