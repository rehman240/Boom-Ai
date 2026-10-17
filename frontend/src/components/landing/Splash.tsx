"use client";

import { useEffect, useState } from "react";
import { getImageProps } from "next/image";
import { APP_NAME } from "@/lib/brand";

const SEEN_KEY = "booom.splash-seen";
const MUTE_KEY = "booom.sound-muted"; // same switch as the section sounds in the app
const SPLASH_SOUND = "/audio/splash.mp3";

/**
 * Hides the splash before the first paint when it was already opened in this tab, so going
 * back to the landing page doesn't show it again (and doesn't flash it either).
 */
const SEEN_SCRIPT = `try{if(sessionStorage.getItem("${SEEN_KEY}"))document.documentElement.dataset.splash="seen"}catch(e){}`;

/** Full-screen logo art shown on arrival. A tap (or Enter) plays the sound and opens the page. */
export function Splash() {
  const [open, setOpen] = useState(true);

  // The page behind must not scroll while the splash covers it. When it was already seen in
  // this tab, CSS hides it (see globals.css) and the page scrolls as usual.
  useEffect(() => {
    const covering = open && document.documentElement.dataset.splash !== "seen";
    document.body.style.overflow = covering ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function enter() {
    try {
      if (window.localStorage.getItem(MUTE_KEY) !== "1") {
        new Audio(SPLASH_SOUND).play().catch(() => undefined);
      }
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Blocked storage: the splash simply shows again next time.
    }
    document.documentElement.dataset.splash = "seen";
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
    <>
      <script dangerouslySetInnerHTML={{ __html: SEEN_SCRIPT }} />
      <button
        type="button"
        onClick={enter}
        autoFocus
        aria-label={`Enter ${APP_NAME}`}
        className="splash fixed inset-0 z-50 block h-dvh w-full cursor-pointer bg-[#040a1e]"
      >
        <picture>
          {/* Wide art on landscape screens, tall art on portrait ones. */}
          <source media="(min-aspect-ratio: 1/1)" srcSet={wide} />
          <source srcSet={tall} />
          {/* eslint-disable-next-line jsx-a11y/alt-text -- decorative; the button has the label */}
          <img {...rest} className="h-full w-full object-cover" />
        </picture>
      </button>
    </>
  );
}
