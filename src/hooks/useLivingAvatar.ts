import { type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMotionProfile, randomBetween } from "../domain/avatarBehavior";
import type { AttentionVector, IdleBeat } from "../domain/avatarPointRig";
import type { AvatarState, GestureId } from "../domain/types";

interface LivingAvatarResult {
  attentionRef: RefObject<AttentionVector>;
  blink: boolean;
  idleBeat: IdleBeat;
  motion: ReturnType<typeof getMotionProfile>["motion"];
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
}

const beats: Exclude<IdleBeat, "none">[] = ["soft-nod", "shoulder-shift", "curious-tilt"];

export function useLivingAvatar(state: AvatarState, gesture: GestureId): LivingAvatarResult {
  const attentionRef = useRef<AttentionVector>({ x: 0, y: 0 });
  const pointerActive = useRef(false);
  const wander = useRef({ x: 0, y: 0 });
  const profile = useMemo(() => getMotionProfile(state, gesture), [state, gesture]);
  const [blink, setBlink] = useState(false);
  const [idleBeat, setIdleBeat] = useState<IdleBeat>("none");

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerActive.current = true;
    attentionRef.current = {
      x: Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2)),
      y: Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2)),
    };
  }, []);

  const onPointerLeave = useCallback(() => {
    pointerActive.current = false;
    attentionRef.current = wander.current;
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;
    let stopped = false;
    let blinkTimer = 0;
    let closeTimer = 0;
    let doubleTimer = 0;

    const scheduleBlink = () => {
      blinkTimer = window.setTimeout(() => {
        if (stopped) return;
        setBlink(true);
        closeTimer = window.setTimeout(() => {
          setBlink(false);
          if (Math.random() < 0.18) {
            doubleTimer = window.setTimeout(() => {
              setBlink(true);
              closeTimer = window.setTimeout(() => setBlink(false), 110);
            }, 130);
          }
          scheduleBlink();
        }, 130);
      }, randomBetween(2_200, 5_800));
    };

    scheduleBlink();
    return () => {
      stopped = true;
      window.clearTimeout(blinkTimer);
      window.clearTimeout(closeTimer);
      window.clearTimeout(doubleTimer);
    };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;
    let stopped = false;
    let wanderTimer = 0;
    let beatTimer = 0;
    let beatEndTimer = 0;

    const scheduleWander = () => {
      wanderTimer = window.setTimeout(() => {
        if (stopped) return;
        wander.current = { x: randomBetween(-0.72, 0.72), y: randomBetween(-0.45, 0.42) };
        if (!pointerActive.current) attentionRef.current = wander.current;
        scheduleWander();
      }, randomBetween(3_000, 7_500));
    };

    const scheduleBeat = () => {
      beatTimer = window.setTimeout(() => {
        if (stopped) return;
        if (state === "idle" || state === "listening") {
          setIdleBeat(beats[Math.floor(Math.random() * beats.length)]);
          beatEndTimer = window.setTimeout(() => setIdleBeat("none"), 1_900);
        }
        scheduleBeat();
      }, randomBetween(6_500, 13_500));
    };

    scheduleWander();
    scheduleBeat();
    return () => {
      stopped = true;
      window.clearTimeout(wanderTimer);
      window.clearTimeout(beatTimer);
      window.clearTimeout(beatEndTimer);
    };
  }, [state]);

  return { attentionRef, blink, idleBeat, motion: profile.motion, onPointerMove, onPointerLeave };
}
