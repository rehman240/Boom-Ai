"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowRight, Loader2, Plus, RefreshCw, Sparkles, UserPlus, X } from "lucide-react";
import { AudienceCardView, AudienceForm, letter, validateAudience } from "@/components/app/AudienceCard";
import { CampaignUnavailable, StageHeader, useCampaign } from "@/components/app/StageHeader";
import { VersionHistory } from "@/components/app/VersionHistory";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ApiError } from "@/lib/api";
import {
  EMPTY_AUDIENCE,
  MAX_EXCLUSIONS,
  addOwnAudience,
  generateAudiences,
  getAudiences,
  removeAudience,
  setExclusions,
  type AudienceCard,
  type AudienceDraft,
  type AudienceStage,
} from "@/lib/audiences";
import { editItem, restoreVersion, selectItem } from "@/lib/items";
import { useJobPolling } from "@/lib/useJob";

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function TargetPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCampaign(id);
  const [stage, setStage] = useState<AudienceStage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>(""); // id of the card being changed, or an action name
  const [writing, setWriting] = useState(false);
  const [history, setHistory] = useState<AudienceCard | null>(null);
  const [removing, setRemoving] = useState<AudienceCard | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStage(await getAudiences(id));
      setLoadError("");
    } catch (e) {
      setLoadError(message(e, "Couldn't load the audiences."));
    }
  }, [id]);

  useEffect(() => {
    // Loading data on mount; the state is set once the request comes back.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const generating = useJobPolling(id, stage?.job ?? null, () => refresh());
  const readOnly = load.status === "ready" && load.project.is_demo;

  async function act(key: string, run: () => Promise<unknown>, fallback: string) {
    setError("");
    setBusy(key);
    try {
      await run();
      await refresh();
      return true;
    } catch (e) {
      setError(message(e, fallback));
      return false;
    } finally {
      setBusy("");
    }
  }

  // The refresh after starting brings back the running job, which starts the polling.
  const generate = () => act("generate", () => generateAudiences(id), "Couldn't start. Please try again.");

  if (load.status === "error") return <CampaignUnavailable message={load.message} />;

  const cards = stage?.cards ?? [];
  const failed = stage?.job?.status === "failed" ? stage.job : null;
  const primary = cards.find((c) => c.selected);

  return (
    <>
      <StageHeader
        load={load}
        stage="target"
        eyebrow="02 / Identify target"
        title="Who should this campaign speak to?"
        subtitle="Audience ideas from your confirmed brief. Each one is a hypothesis: edit it, choose one primary audience, or write your own."
      />

      {loadError ? (
        <Alert>
          {loadError}{" "}
          <button className="font-semibold underline underline-offset-4" onClick={refresh}>
            Try again
          </button>
        </Alert>
      ) : null}

      {!stage && !loadError ? (
        <p className="mt-10 flex items-center gap-2 text-muted" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading audiences…
        </p>
      ) : null}

      {stage?.blocked_reason ? (
        <section className="mt-10 rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <h2 className="font-display text-xl font-bold">First, confirm your brief</h2>
          <p className="mt-2 max-w-xl text-muted">
            {stage.blocked_reason} Audience ideas are built only from facts you have checked, so nothing is guessed.
          </p>
          <ButtonLink href={`/projects/${id}/brief`} className="mt-6">
            Go to the brief <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </ButtonLink>
        </section>
      ) : null}

      {stage && !stage.blocked_reason ? (
        <>
          {error ? <Alert>{error}</Alert> : null}
          {failed && !generating ? (
            <Alert>
              {failed.error} {cards.length ? "Your audiences are unchanged." : ""}
              {readOnly ? null : (
                <Button variant="secondary" className="mt-3 h-10 px-4 text-sm" onClick={generate} loading={busy === "generate"}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
                </Button>
              )}
            </Alert>
          ) : null}

          {generating ? <Generating hasCards={cards.length > 0} /> : null}

          {!cards.length && !generating ? (
            <section className="mt-10 rounded-3xl border border-border bg-surface p-8 sm:p-10">
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Ready when you are
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold">Find the people to speak to</h2>
              <p className="mt-2 max-w-2xl text-muted">
                The AI suggests two to four audiences from your confirmed brief, says what each one is based on, and marks
                anything it had to assume. It takes a minute or two.
              </p>
              {readOnly ? null : (
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button onClick={generate} loading={busy === "generate"}>
                    <Sparkles className="h-4 w-4" aria-hidden="true" /> Suggest audiences
                  </Button>
                  <Button variant="secondary" onClick={() => setWriting(true)}>
                    <UserPlus className="h-4 w-4" aria-hidden="true" /> Write my own
                  </Button>
                </div>
              )}
            </section>
          ) : null}

          {cards.length ? (
            <section aria-label="Audience ideas" className="mt-10 grid gap-5 lg:grid-cols-2">
              {cards.map((card, index) => (
                <AudienceCardView
                  key={card.id}
                  card={card}
                  index={index}
                  readOnly={readOnly}
                  busy={busy !== ""}
                  onChoose={() => act(card.id, () => selectItem(id, card.id), "Couldn't choose this audience.")}
                  onSave={(changes) => act(card.id, () => editItem(id, card.id, changes), "Couldn't save your changes.")}
                  onUndo={() => act(card.id, () => restoreVersion(id, card.id, card.version), "Couldn't undo. Please try again.")}
                  onHistory={() => setHistory(card)}
                  onRemove={() => setRemoving(card)}
                />
              ))}
              {readOnly ? null : (
                <button
                  type="button"
                  onClick={() => setWriting(true)}
                  className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border-strong p-8 text-center text-muted transition-colors hover:border-cyan hover:text-text"
                >
                  <UserPlus className="h-8 w-8" aria-hidden="true" />
                  <span className="font-display text-lg font-bold">Write your own audience</span>
                  <span className="text-sm">You know your customers. Add them in your own words.</span>
                </button>
              )}
            </section>
          ) : null}

          <ExclusionsPanel
            projectId={id}
            exclusions={stage.exclusions}
            readOnly={readOnly}
            onSaved={setStage}
          />

          {cards.length && !readOnly ? (
            // Sticky on large screens only, with room on the right for the round audio guide
            // button. On phones it sits at the end of the page, with space below so the button
            // never covers it.
            <div className="mt-8 mb-24 rounded-2xl border border-border bg-bg/95 px-4 py-4 lg:sticky lg:bottom-0 lg:z-10 lg:mb-0 lg:pr-24 lg:backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted" role="status">
                  {primary ? (
                    <>
                      Primary audience: <span className="font-semibold text-text">{primary.data.name}</span>
                    </>
                  ) : (
                    "Choose one primary audience to continue."
                  )}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="secondary"
                    onClick={generate}
                    loading={busy === "generate"}
                    disabled={generating}
                    title="Cards you chose, edited or wrote are kept"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> New ideas
                  </Button>
                  {primary ? (
                    <ButtonLink href={`/projects/${id}/campaign`}>
                      Continue to campaign <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </ButtonLink>
                  ) : (
                    <Button disabled>
                      Continue to campaign <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm text-subtle">New ideas keep the cards you chose, edited or wrote.</p>
            </div>
          ) : null}
        </>
      ) : null}

      {writing ? (
        <WriteOwn
          onClose={() => setWriting(false)}
          onSubmit={async (draft) => {
            const ok = await act("write", () => addOwnAudience(id, draft), "Couldn't add your audience.");
            if (ok) setWriting(false);
            return ok;
          }}
          busy={busy === "write"}
          error={busy === "" ? error : ""}
        />
      ) : null}

      {history ? (
        <VersionHistory
          projectId={id}
          item={history}
          title={`Audience ${letter(cards.findIndex((c) => c.id === history.id))}`}
          preview={(data) => [data.name, data.definition].filter(Boolean).join(": ")}
          readOnly={readOnly}
          onRestored={refresh}
          onClose={() => setHistory(null)}
        />
      ) : null}

      {removing ? (
        <Dialog
          title="Remove this audience?"
          description={`“${removing.data.name}” leaves the list. It stays in this campaign's records, so nothing is lost.`}
          onClose={() => setRemoving(null)}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy === removing.id}
              onClick={async () => {
                await act(removing.id, () => removeAudience(id, removing.id), "Couldn't remove this audience.");
                setRemoving(null);
              }}
            >
              Remove
            </Button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 flex gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-base text-danger" role="alert">
      <AlertTriangle className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

function Generating({ hasCards }: { hasCards: boolean }) {
  return (
    <section className="mt-10 rounded-3xl border border-cyan/40 bg-primary/10 p-6 sm:p-8" role="status" aria-live="polite">
      <p className="flex items-center gap-3 font-display text-xl font-bold">
        <Loader2 className="h-6 w-6 animate-spin text-cyan" aria-hidden="true" />
        {hasCards ? "Finding new audience ideas…" : "Finding your audiences…"}
      </p>
      <p className="mt-2 max-w-2xl text-muted">
        This usually takes one to two minutes. It keeps going if you leave or refresh this page.
        {hasCards ? " The cards you chose, edited or wrote will stay." : ""}
      </p>
    </section>
  );
}

function WriteOwn({
  onClose,
  onSubmit,
  busy,
  error,
}: {
  onClose: () => void;
  onSubmit: (draft: AudienceDraft) => Promise<boolean>;
  busy: boolean;
  error: string;
}) {
  const [draft, setDraft] = useState<AudienceDraft>(EMPTY_AUDIENCE);
  const [errors, setErrors] = useState<Partial<Record<keyof AudienceDraft, string>>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateAudience(draft);
    setErrors(found);
    if (!Object.keys(found).length) await onSubmit(draft);
  }

  return (
    <Dialog title="Write your own audience" description="Only the name and who they are are needed. Add the rest if you know it." onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <AudienceForm value={draft} onChange={setDraft} errors={errors} />
        {error ? (
          <p className="mt-4 text-base text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add audience
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Who the campaign must not target. Saved straight away; every later step receives it. */
function ExclusionsPanel({
  projectId,
  exclusions,
  readOnly,
  onSaved,
}: {
  projectId: string;
  exclusions: string[];
  readOnly: boolean;
  onSaved: (stage: AudienceStage) => void;
}) {
  const [list, setList] = useState(exclusions);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState("");

  async function save(next: string[]) {
    const previous = list;
    setList(next);
    setStatus("saving");
    setError("");
    try {
      const stage = await setExclusions(projectId, next);
      setStatus("saved");
      onSaved(stage);
    } catch (e) {
      setList(previous);
      setStatus("");
      setError(message(e, "Couldn't save. Please try again."));
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (list.some((x) => x.toLowerCase() === value.toLowerCase())) {
      setText("");
      return;
    }
    setText("");
    save([...list, value]);
  }

  return (
    <section className="mt-8 rounded-3xl border border-border bg-surface p-6 sm:p-8" aria-labelledby="exclusions-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="exclusions-title" className="font-display text-xl font-bold">
          Who to leave out
        </h2>
        <p className="text-sm text-subtle" role="status">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
        </p>
      </div>
      <p className="mt-1 text-base text-muted">
        People this campaign must not target, for example “Under 18s” or “Current customers”. New ideas and every next step
        follow this list.
      </p>

      {list.length ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {list.map((x) => (
            <li key={x} className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface-2 py-1 pr-1 pl-4 text-base text-text">
              {x}
              {readOnly ? null : (
                <button
                  type="button"
                  onClick={() => save(list.filter((y) => y !== x))}
                  aria-label={`Remove ${x}`}
                  className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-subtle">No one is excluded yet.</p>
      )}

      {readOnly ? null : list.length < MAX_EXCLUSIONS ? (
        <form onSubmit={add} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="exclusion-input" className="sr-only">
            Add someone to leave out
          </label>
          <input
            id="exclusion-input"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a group to leave out"
            className="h-14 w-full rounded-xl border border-border-strong bg-bg/60 px-4 text-lg text-text placeholder:text-subtle hover:border-[#33529a] focus:border-cyan focus:ring-2 focus:ring-cyan/25 focus:outline-none sm:max-w-md"
          />
          <Button type="submit" variant="secondary" disabled={!text.trim() || status === "saving"}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-subtle">That&apos;s the most this list can hold ({MAX_EXCLUSIONS}).</p>
      )}
      {error ? (
        <p className="mt-3 text-base text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
