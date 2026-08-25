import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Activity, AudioLines, BrainCircuit, Ear, Sparkles } from "lucide-react";
import { resolveAvatarFrame, resolveBlinkFrame, type AvatarFrameId } from "../domain/avatarFrames";
import type { AvatarOutfitId, AvatarState, EmotionId, GestureId } from "../domain/types";
import { useLivingAvatar } from "../hooks/useLivingAvatar";
import { PointRigCanvas, type AvatarRendererMode } from "./PointRigCanvas";
import { AUTHORED_HEAD_FRAME_TIMELINES } from "../domain/avatarPointRig";
import {
  getFrameTransitionDurationMs,
  getFrameTransitionKind,
  type FrameTransitionKind,
} from "../domain/avatarTransitions";

interface AvatarStageProps {
  state: AvatarState;
  outfit: AvatarOutfitId;
  emotion: EmotionId;
  emotionIntensity: number;
  gesture: GestureId;
  gestureRevision: number;
  easterEggActive: boolean;
  easterEggRevision: number;
  lipLevel: number;
  partialTranscript: string;
  onRendererChange?: (mode: AvatarRendererMode) => void;
}

const stateLabels: Record<AvatarState, string> = {
  idle: "Я рядом",
  listening: "Слушаю тебя",
  thinking: "Обдумываю ответ",
  speaking: "Отвечаю",
  error: "Что-то пошло не так",
};

const emotionLabels: Record<EmotionId, string> = {
  neutral: "спокойна",
  joy: "рада",
  sadness: "грустит",
  concern: "сопереживает",
  surprise: "удивлена",
  thinking: "размышляет",
  confused: "озадачена",
};

const StateIcon = ({ state }: { state: AvatarState }) => {
  if (state === "listening") return <Ear size={15} />;
  if (state === "thinking") return <BrainCircuit size={15} />;
  if (state === "speaking") return <AudioLines size={15} />;
  if (state === "error") return <Activity size={15} />;
  return <Sparkles size={15} />;
};

interface FrameTransition {
  current: { frame: AvatarFrameId; outfit: AvatarOutfitId };
  previous: { frame: AvatarFrameId; outfit: AvatarOutfitId } | null;
  revision: number;
  kind: FrameTransitionKind;
  durationMs: number;
}

function useAuthoredHeadMotion(baseFrame: AvatarFrameId, state: AvatarState, gesture: GestureId, gestureRevision: number): AvatarFrameId {
  const [motionFrame, setMotionFrame] = useState<AvatarFrameId | null>(null);

  useEffect(() => {
    const timers: number[] = [];
    setMotionFrame(null);
    if (state !== "speaking") return;

    const timeline = AUTHORED_HEAD_FRAME_TIMELINES[gesture];
    if (!timeline) return;
    setMotionFrame(timeline[0]?.frame ?? null);
    for (const key of timeline.slice(1)) {
      timers.push(window.setTimeout(() => setMotionFrame(key.frame), key.atMs));
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [state, gesture, gestureRevision]);

  return motionFrame ?? baseFrame;
}

const OUTFIT_TRANSITION_MS = 640;

const sameVisualFrame = (
  first: { frame: AvatarFrameId; outfit: AvatarOutfitId },
  second: { frame: AvatarFrameId; outfit: AvatarOutfitId },
) => first.frame === second.frame && first.outfit === second.outfit;

function useFrameTransition(targetFrame: AvatarFrameId, targetOutfit: AvatarOutfitId): FrameTransition {
  const initial = { frame: targetFrame, outfit: targetOutfit };
  const currentRef = useRef(initial);
  const pendingRef = useRef<typeof initial | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const activeUntilRef = useRef(0);
  const activeKindRef = useRef<FrameTransitionKind | null>(null);
  const [transition, setTransition] = useState<FrameTransition>({
    current: initial,
    previous: null,
    revision: 0,
    kind: "pose",
    durationMs: 0,
  });

  const startTransition = useCallback(function beginFrameTransition(next: typeof initial) {
    if (sameVisualFrame(next, currentRef.current)) return;
    const previous = currentRef.current;
    const outfitChanged = previous.outfit !== next.outfit;
    const kind = outfitChanged ? "pose" : getFrameTransitionKind(previous.frame, next.frame);
    const durationMs = outfitChanged
      ? OUTFIT_TRANSITION_MS
      : getFrameTransitionDurationMs(previous.frame, next.frame);
    currentRef.current = next;
    activeKindRef.current = kind;
    activeUntilRef.current = performance.now() + durationMs + 24;
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
    setTransition((value) => ({ current: next, previous, revision: value.revision + 1, kind, durationMs }));
    clearTimerRef.current = window.setTimeout(() => {
      activeKindRef.current = null;
      activeUntilRef.current = 0;
      setTransition((value) => (sameVisualFrame(value.current, next) ? { ...value, previous: null } : value));
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending && !sameVisualFrame(pending, currentRef.current)) beginFrameTransition(pending);
    }, durationMs + 24);
  }, []);

  useEffect(() => {
    const target = { frame: targetFrame, outfit: targetOutfit };
    if (sameVisualFrame(target, currentRef.current)) {
      pendingRef.current = null;
      return;
    }

    const nextKind = currentRef.current.outfit !== target.outfit
      ? "pose"
      : getFrameTransitionKind(currentRef.current.frame, target.frame);
    if (performance.now() < activeUntilRef.current && activeKindRef.current !== "blink") {
      // A blink is optional. Skipping it is less visible than interrupting a large authored pose fade.
      if (nextKind !== "blink") pendingRef.current = target;
      return;
    }
    startTransition(target);
  }, [startTransition, targetFrame, targetOutfit]);

  useEffect(() => () => {
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
  }, []);

  return transition;
}

export function AvatarStage({ state, outfit, emotion, emotionIntensity, gesture, gestureRevision, easterEggActive, easterEggRevision, lipLevel, partialTranscript, onRendererChange }: AvatarStageProps) {
  const living = useLivingAvatar(state, gesture);
  const baseFrame: AvatarFrameId = easterEggActive ? "private-playful" : resolveAvatarFrame(state, emotion, gesture);
  const semanticFrame = useAuthoredHeadMotion(baseFrame, state, gesture, gestureRevision);
  const blinkFrame = resolveBlinkFrame(semanticFrame, state);
  const targetFrame = living.blink && blinkFrame ? blinkFrame : semanticFrame;
  const frame = useFrameTransition(targetFrame, outfit);
  const style = {
    "--lip-level": lipLevel.toFixed(3),
    "--emotion-intensity": emotionIntensity.toFixed(3),
  } as CSSProperties;

  return (
    <section
      className="avatar-stage"
      aria-label="Аватар BoxGirl"
      onPointerMove={living.onPointerMove}
      onPointerLeave={living.onPointerLeave}
    >
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className={`state-pill state-${state}`}>
        <StateIcon state={state} />
        <span>{stateLabels[state]}</span>
      </div>

      <div
        className={`avatar-rig avatar-state-${state} emotion-${emotion} gesture-${gesture} motion-${living.motion} idle-beat-${living.idleBeat}`}
        style={style}
        data-testid="avatar"
        data-frame={semanticFrame}
        data-outfit={outfit}
        data-motion={living.motion}
      >
        <div className="aura" />
        <div className="ground-shadow" />
        <div className="avatar-frame-stack" aria-hidden="true">
          <PointRigCanvas
            currentFrame={frame.current.frame}
            currentOutfit={frame.current.outfit}
            previousFrame={frame.previous?.frame ?? null}
            previousOutfit={frame.previous?.outfit ?? null}
            transitionDurationMs={frame.durationMs}
            transitionRevision={frame.revision}
            state={state}
            gesture={gesture}
            gestureRevision={gestureRevision}
            easterEggActive={easterEggActive}
            easterEggRevision={easterEggRevision}
            idleBeat={living.idleBeat}
            attentionRef={living.attentionRef}
            onRendererChange={onRendererChange}
          />
        </div>
      </div>

      <div className="avatar-caption">
        <span className="avatar-name">BoxGirl</span>
        <span className="emotion-label">{emotionLabels[emotion]}</span>
      </div>

      {state === "listening" && partialTranscript && (
        <div className="live-transcript" aria-live="polite">«{partialTranscript}»</div>
      )}
    </section>
  );
}
