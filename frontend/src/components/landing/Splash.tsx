"use client";

import { useEffect, useRef, useState } from "react";
import { getImageProps } from "next/image";
import { APP_NAME } from "@/lib/brand";

const MUTE_KEY = "booom.sound-muted"; // same switch as the section sounds in the app

/**
 * The client is sending his own sound (credit-free). When it arrives, put it in
 * public/audio/splash.mp3 and set this to "/audio/splash.mp3". Until then the tap is silent.
 */
const SPLASH_SOUND: string | null = null;

/** Full-screen logo art shown every time the page opens. A tap (or Enter) plays the sound and opens the page. */
export function Splash() {
  const [open, setOpen] = useState(true);
  const sound = useRef<HTMLAudioElement | null>(null);

  // Load the sound up front so a tap plays it at once, even on a slow phone connection.
  useEffect(() => {
    if (!SPLASH_SOUND) return;
    const audio = new Audio(SPLASH_SOUND);
    audio.preload = "auto";
    audio.load();
    sound.current = audio;
  }, []);

  // The page behind must not scroll while the splash covers it.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function enter() {
    let muted = false;
    try {
      muted = window.localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      // Blocked storage: treat sound as on.
    }
    if (!muted) sound.current?.play().catch(() => undefined);
    setOpen(false);
  }

  if (!open) return null;

  const common = { alt: "", preload: true, sizes: "100vw" };
  const {
    props: { srcSet: wide },
  } = getImageProps({ ...common, src: "/brand/hero-wide.webp", width: 1600, height: 914 });
  const {
    props: { srcSet: tall, ...rest },
  } = getImageProps({ ...common, src: "/brand/hero-tall.webp", width: 800, height: 1422 });

  return (
    <button
      type="button"
      onClick={enter}
      autoFocus
      aria-label={`Enter ${APP_NAME}`}
      className="fixed inset-0 z-50 block h-dvh w-full cursor-pointer bg-[#040a1e]"
    >
      <picture>
        {/* Wide art on landscape screens, tall art on portrait ones. */}
        <source media="(min-aspect-ratio: 1/1)" srcSet={wide} />
        <source srcSet={tall} />
        {/* eslint-disable-next-line jsx-a11y/alt-text -- decorative; the button has the label */}
        <img {...rest} className="h-full w-full object-cover" />
      </picture>
    </button>
  );
}
