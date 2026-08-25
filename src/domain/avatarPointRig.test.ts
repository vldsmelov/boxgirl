import { describe, expect, it } from "vitest";
import {
  AUTHORED_HEAD_FRAME_TIMELINES,
  GESTURE_TIMINGS,
  POINT_SPRING_FREQUENCIES,
  createMeshIndices,
  createRigPose,
  createSpringRigState,
  deformMeshVertices,
  getRigPointDefinitions,
  sampleKeyframes,
  sampleRigPose,
  stepSpringRig,
} from "./avatarPointRig";
import { PRIVATE_EASTER_EGG_DURATION_MS } from "./privateEasterEgg";

describe("point-rig motion", () => {
  it("interpolates authored timing keys smoothly", () => {
    const keys = [[0, 0], [0.5, 1], [1, 0]] as const;
    expect(sampleKeyframes(keys, 0)).toBe(0);
    expect(sampleKeyframes(keys, 0.5)).toBe(1);
    expect(sampleKeyframes(keys, 1)).toBe(0);
    expect(sampleKeyframes(keys, 0.25)).toBeCloseTo(0.5, 5);
  });

  it("keeps every procedural offset inside the safe deformation budget", () => {
    for (const gesture of Object.keys(GESTURE_TIMINGS) as (keyof typeof GESTURE_TIMINGS)[]) {
      const pose = sampleRigPose({
        nowMs: 1_700,
        gestureElapsedMs: GESTURE_TIMINGS[gesture].durationMs * 0.42,
        state: "speaking",
        gesture,
        idleBeat: "curious-tilt",
        attentionX: 1,
        attentionY: -1,
        reducedMotion: false,
      });
      for (const point of Object.values(pose)) {
        expect(Math.abs(point.x)).toBeLessThanOrEqual(0.018);
        expect(Math.abs(point.y)).toBeLessThanOrEqual(0.014);
        expect(Math.abs(point.rotation)).toBeLessThanOrEqual(0.04);
      }
    }
  });

  it("pins mesh boundaries while deforming internal head points", () => {
    const pose = createRigPose();
    pose.head.x = 0.01;
    const vertices = deformMeshVertices("neutral", pose, 4, 4);
    expect(vertices[0]).toBe(0);
    expect(vertices[1]).toBe(0);
    const topRight = 4 * 4;
    expect(vertices[topRight]).toBe(1);
    expect(vertices[topRight + 1]).toBe(0);
    const internal = (1 * 5 + 2) * 4;
    expect(vertices[internal]).toBeGreaterThan(0.5);
  });

  it("uses pose-aware hand anchors", () => {
    expect(getRigPointDefinitions("wave").handLeft.y).toBeLessThan(0.5);
    expect(getRigPointDefinitions("confused-blink").handRight.x).toBeGreaterThan(0.8);
    expect(getRigPointDefinitions("neutral").handLeft.y).toBeGreaterThan(0.8);
  });

  it("advances a critically damped spring toward its target", () => {
    const spring = createSpringRigState();
    const target = createRigPose();
    target.head.x = 0.01;
    for (let index = 0; index < 30; index += 1) stepSpringRig(spring, target, 1 / 60);
    expect(spring.head.value.x).toBeGreaterThan(0.009);
    expect(spring.head.value.x).toBeLessThanOrEqual(0.0101);
  });

  it("keeps the exact spring stable across common frame rates without overshoot", () => {
    const simulate = (deltaSeconds: number) => {
      const spring = createSpringRigState();
      const target = createRigPose();
      target.head.x = 0.01;
      for (let elapsed = 0; elapsed < 0.5; elapsed += deltaSeconds) {
        stepSpringRig(spring, target, deltaSeconds, 3.5);
        expect(spring.head.value.x).toBeGreaterThanOrEqual(0);
        expect(spring.head.value.x).toBeLessThanOrEqual(0.01);
      }
      return spring.head.value.x;
    };

    expect(simulate(1 / 30)).toBeCloseTo(simulate(1 / 120), 4);
  });

  it("gives secondary parts more inertia than semantic controls", () => {
    expect(POINT_SPRING_FREQUENCIES.hairLeft).toBeLessThan(POINT_SPRING_FREQUENCIES.head);
    expect(POINT_SPRING_FREQUENCIES.cordRight).toBeLessThan(POINT_SPRING_FREQUENCIES.handRight);
    expect(POINT_SPRING_FREQUENCIES.chest).toBeLessThan(POINT_SPRING_FREQUENCIES.neck);
  });

  it("applies four separated private impulses only inside its explicit timeline", () => {
    const samplePrivatePose = (progress: number) => sampleRigPose({
      nowMs: 1_000,
      gestureElapsedMs: 0,
      state: "speaking",
      gesture: "none",
      idleBeat: "none",
      attentionX: 0,
      attentionY: 0,
      reducedMotion: false,
      easterEggElapsedMs: PRIVATE_EASTER_EGG_DURATION_MS * progress,
    });
    const peaks = [0.14, 0.34, 0.55, 0.76].map(samplePrivatePose);
    const rebounds = [0.23, 0.44, 0.65, 0.86].map(samplePrivatePose);
    const inactive = samplePrivatePose(Number.POSITIVE_INFINITY);

    expect(peaks[0].chestLeft.y).toBeLessThan(-0.02);
    expect(peaks[1].chestLeft.y).toBeLessThan(-0.017);
    expect(peaks[2].chestLeft.y).toBeLessThan(-0.014);
    expect(peaks[3].chestLeft.y).toBeLessThan(-0.01);
    expect(rebounds.every((pose) => pose.chestLeft.y > 0.004)).toBe(true);
    expect(peaks.every((pose) => Math.abs(pose.chestLeft.y) <= 0.022)).toBe(true);
    expect(peaks[0].chestRight.y).toBeLessThan(0);
    expect(peaks[0].chestLeft.y).not.toBe(peaks[0].chestRight.y);
    expect(inactive.chestLeft.y).toBe(0);
    expect(inactive.chestRight.y).toBe(0);
  });

  it("creates two triangles per mesh cell", () => {
    expect(createMeshIndices(3, 2)).toHaveLength(3 * 2 * 6);
  });

  it("keeps authored head keys inside the semantic gesture timeline", () => {
    for (const gesture of ["nod", "shake_head"] as const) {
      const timeline = AUTHORED_HEAD_FRAME_TIMELINES[gesture];
      expect(timeline?.[0].atMs).toBe(0);
      expect(timeline?.at(-1)?.frame).toBeNull();
      expect(timeline?.at(-1)?.atMs).toBeLessThan(GESTURE_TIMINGS[gesture].durationMs);
    }
  });

  it("reuses a supplied pose buffer without retaining values from the previous frame", () => {
    const output = createRigPose();
    const moving = sampleRigPose({
      nowMs: 900,
      gestureElapsedMs: 320,
      state: "speaking",
      gesture: "shake_head",
      idleBeat: "none",
      attentionX: 1,
      attentionY: 0,
      reducedMotion: false,
    }, output);
    expect(moving).toBe(output);
    expect(Math.abs(moving.head.x)).toBeGreaterThan(0.001);
    const reduced = sampleRigPose({
      nowMs: 950,
      gestureElapsedMs: 370,
      state: "speaking",
      gesture: "shake_head",
      idleBeat: "none",
      attentionX: 1,
      attentionY: 0,
      reducedMotion: true,
    }, output);
    expect(reduced).toBe(output);
    expect(reduced.head.x).toBe(0);
    expect(reduced.head.scaleX).toBe(1);
  });
});
