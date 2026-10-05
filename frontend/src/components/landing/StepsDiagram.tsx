import { ChevronDown, Images, Lightbulb, Target, Wallet, type LucideIcon } from "lucide-react";

type Step = { lead: string; word: string; icon: LucideIcon; color: string };

// The four steps of the product, in the order the user meets them. Each colour keeps white
// text at AA contrast for large bold type.
const STEPS: Step[] = [
  { lead: "Find your", word: "Audience", icon: Target, color: "#2456f0" },
  { lead: "Shape the", word: "Campaign", icon: Lightbulb, color: "#0e7490" },
  { lead: "Create the", word: "Assets", icon: Images, color: "#15803d" },
  { lead: "Plan the", word: "Budget", icon: Wallet, color: "#c2410c" },
];

/**
 * "Find your audience → shape the campaign → create the assets → plan the budget" as one
 * picture. Arrow boxes in a row on wide screens, a stack with arrows between on phones.
 * A soft glow walks from step to step, slowly, to show the order without moving anything.
 */
export function StepsDiagram() {
  return (
    <ol aria-label="How it works, in four steps" className="mx-auto grid w-full max-w-6xl gap-0 lg:grid-cols-4 lg:gap-2">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const last = i === STEPS.length - 1;
        return (
          <li key={step.word} className="flex flex-col items-center">
            <div
              className={`steps-box flex w-full items-center gap-4 px-6 py-5 text-left text-white lg:min-h-44 lg:flex-col lg:justify-center lg:gap-3 lg:text-center ${
                i === 0 ? "steps-first" : ""
              } ${last ? "steps-last" : ""}`}
              style={{ backgroundColor: step.color, animationDelay: `${i * 2}s` }}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 lg:h-12 lg:w-12">
                <Icon className="h-8 w-8 lg:h-7 lg:w-7" aria-hidden="true" />
              </span>
              <span className="leading-tight">
                <span className="block text-xl font-semibold">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.lead}
                </span>
                <span className="block font-display text-3xl font-bold">{step.word}</span>
              </span>
            </div>
            {last ? null : (
              <ChevronDown className="my-1 h-9 w-9 text-subtle lg:hidden" strokeWidth={3} aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
