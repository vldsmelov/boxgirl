import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import {
  getAvatarRigFrameSource,
  type AvatarFrameId,
} from "../domain/avatarFrames";
import {
  createRigPose,
  createMeshIndices,
  createSpringRigState,
  deformMeshVertices,
  RIG_POINT_IDS,
  sampleRigPose,
  stepSpringRig,
  type AttentionVector,
  type IdleBeat,
  type RigMotionInput,
} from "../domain/avatarPointRig";
import type { AvatarOutfitId, AvatarState, GestureId } from "../domain/types";
import { easeFrameTransition } from "../domain/avatarTransitions";

interface PointRigCanvasProps {
  currentFrame: AvatarFrameId;
  currentOutfit: AvatarOutfitId;
  previousFrame: AvatarFrameId | null;
  previousOutfit: AvatarOutfitId | null;
  transitionDurationMs: number;
  transitionRevision: number;
  state: AvatarState;
  gesture: GestureId;
  gestureRevision: number;
  easterEggActive: boolean;
  easterEggRevision: number;
  idleBeat: IdleBeat;
  attentionRef: RefObject<AttentionVector>;
  onRendererChange?: (mode: AvatarRendererMode) => void;
}

export type AvatarRendererMode = "point-rig-webgl" | "frame-fallback";

interface RendererPropsSnapshot extends PointRigCanvasProps {}

const MESH_COLUMNS = 24;
const MESH_ROWS = 36;
const MAX_DEVICE_PIXEL_RATIO = 2;
const ZERO_ATTENTION: AttentionVector = { x: 0, y: 0 };

const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    vec2 clip = a_position * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_previous;
  uniform sampler2D u_current;
  uniform float u_mixAmount;

  void main() {
    vec4 previousColor = texture2D(u_previous, v_texCoord);
    vec4 currentColor = texture2D(u_current, v_texCoord);
    gl_FragColor = mix(previousColor, currentColor, u_mixAmount);
  }
`;

const imagePromises = new Map<string, Promise<HTMLImageElement>>();

function textureKey(outfit: AvatarOutfitId, frame: AvatarFrameId): string {
  return `${outfit}:${frame}`;
}

function loadFrameImage(outfit: AvatarOutfitId, frame: AvatarFrameId): Promise<HTMLImageElement> {
  const key = textureKey(outfit, frame);
  const cached = imagePromises.get(key);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Не удалось загрузить кадр ${outfit}:${frame}`));
    image.src = getAvatarRigFrameSource(outfit, frame);
  });
  imagePromises.set(key, promise);
  void promise.then(
    () => imagePromises.delete(key),
    () => imagePromises.delete(key),
  );
  return promise;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL не создал shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const details = gl.getShaderInfoLog(shader) ?? "неизвестная ошибка";
    gl.deleteShader(shader);
    throw new Error(`Ошибка point-rig shader: ${details}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL не создал program");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const details = gl.getProgramInfoLog(program) ?? "неизвестная ошибка";
    gl.deleteProgram(program);
    throw new Error(`Ошибка линковки point-rig: ${details}`);
  }
  return program;
}

function createTexture(gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("WebGL не создал texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return texture;
}

export function PointRigCanvas(props: PointRigCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef<RendererPropsSnapshot>(props);
  const [ready, setReady] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      setReady(false);
      propsRef.current.onRendererChange?.("frame-fallback");
      return;
    }

    let stopped = false;
    let contextLost = false;
    let animationFrame = 0;
    let previousTime = performance.now();
    let transitionStartedAt = previousTime;
    let lastTransitionRevision = propsRef.current.transitionRevision;
    let gestureStartedAt = previousTime;
    let lastGesture = propsRef.current.gesture;
    let lastGestureRevision = propsRef.current.gestureRevision;
    let easterEggStartedAt = Number.NEGATIVE_INFINITY;
    let lastEasterEggRevision = propsRef.current.easterEggRevision;
    const filteredAttention: AttentionVector = { x: 0, y: 0 };
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const spring = createSpringRigState();
    const springPose = createRigPose();
    const targetPose = createRigPose();
    const motionInput: RigMotionInput = {
      nowMs: 0,
      gestureElapsedMs: 0,
      state: propsRef.current.state,
      gesture: propsRef.current.gesture,
      idleBeat: propsRef.current.idleBeat,
      attentionX: 0,
      attentionY: 0,
      reducedMotion: reducedMotionQuery.matches,
      easterEggElapsedMs: Number.POSITIVE_INFINITY,
    };
    const vertices = new Float32Array((MESH_COLUMNS + 1) * (MESH_ROWS + 1) * 4);
    const indices = createMeshIndices(MESH_COLUMNS, MESH_ROWS);
    const textures = new Map<string, WebGLTexture>();
    const textureLoads = new Map<string, Promise<void>>();
    let residentOutfit = propsRef.current.currentOutfit;
    let pendingDisplayKey: string | null = null;
    let program: WebGLProgram | null = null;
    let vertexBuffer: WebGLBuffer | null = null;
    let indexBuffer: WebGLBuffer | null = null;
    let mixAmountLocation: WebGLUniformLocation | null = null;

    const updateTextureDiagnostics = () => {
      const renderer = canvas.parentElement;
      if (!renderer) return;
      renderer.dataset.textureCount = String(textures.size);
      renderer.dataset.residentOutfit = residentOutfit;
    };

    const ensureTexture = async (outfit: AvatarOutfitId, frame: AvatarFrameId) => {
      const key = textureKey(outfit, frame);
      if (textures.has(key)) return;
      const inFlight = textureLoads.get(key);
      if (inFlight) return inFlight;
      const task = (async () => {
        const image = await loadFrameImage(outfit, frame);
        if (!stopped && !contextLost && !textures.has(key)) {
          textures.set(key, createTexture(gl, image));
          updateTextureDiagnostics();
        }
      })();
      textureLoads.set(key, task);
      void task.then(
        () => textureLoads.delete(key),
        () => textureLoads.delete(key),
      );
      return task;
    };

    const releaseInactiveOutfits = (activeOutfit: AvatarOutfitId) => {
      for (const [key, texture] of textures) {
        if (!key.startsWith(`${activeOutfit}:`)) {
          gl.deleteTexture(texture);
          textures.delete(key);
        }
      }
      residentOutfit = activeOutfit;
      updateTextureDiagnostics();
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      setReady(false);
      propsRef.current.onRendererChange?.("frame-fallback");
      window.cancelAnimationFrame(animationFrame);
    };
    const handleContextRestored = () => setContextVersion((value) => value + 1);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    const initialize = async () => {
      try {
        program = createProgram(gl);
        vertexBuffer = gl.createBuffer();
        indexBuffer = gl.createBuffer();
        if (!vertexBuffer || !indexBuffer) throw new Error("WebGL не создал mesh buffers");

        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(program, "a_position");
        const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
        mixAmountLocation = gl.getUniformLocation(program, "u_mixAmount");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);
        gl.uniform1i(gl.getUniformLocation(program, "u_previous"), 0);
        gl.uniform1i(gl.getUniformLocation(program, "u_current"), 1);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);

        const currentFrame = propsRef.current.currentFrame;
        const currentOutfit = propsRef.current.currentOutfit;
        await ensureTexture(currentOutfit, currentFrame);
        if (stopped || contextLost) return;
        setReady(true);
        propsRef.current.onRendererChange?.("point-rig-webgl");

        const render = (now: number) => {
          if (stopped || contextLost || !program || !vertexBuffer) return;
          const currentProps = propsRef.current;
          const displayKey = textureKey(currentProps.currentOutfit, currentProps.currentFrame);
          if (!textures.has(displayKey) && pendingDisplayKey !== displayKey) {
            pendingDisplayKey = displayKey;
            setReady(false);
            void ensureTexture(currentProps.currentOutfit, currentProps.currentFrame).then(() => {
              if (stopped || contextLost) return;
              const latest = propsRef.current;
              if (textureKey(latest.currentOutfit, latest.currentFrame) === displayKey) {
                pendingDisplayKey = null;
                setReady(true);
                latest.onRendererChange?.("point-rig-webgl");
              }
            }).catch(() => {
              pendingDisplayKey = null;
              propsRef.current.onRendererChange?.("frame-fallback");
            });
          }
          const outfitTransitionActive = currentProps.previousFrame !== null
            && currentProps.previousOutfit !== null
            && currentProps.previousOutfit !== currentProps.currentOutfit;
          if (!outfitTransitionActive && currentProps.currentOutfit !== residentOutfit) {
            releaseInactiveOutfits(currentProps.currentOutfit);
          }
          if (currentProps.transitionRevision !== lastTransitionRevision) {
            lastTransitionRevision = currentProps.transitionRevision;
            transitionStartedAt = now;
          }
          if (currentProps.gesture !== lastGesture || currentProps.gestureRevision !== lastGestureRevision) {
            lastGesture = currentProps.gesture;
            lastGestureRevision = currentProps.gestureRevision;
            gestureStartedAt = now;
          }
          if (currentProps.easterEggRevision !== lastEasterEggRevision) {
            lastEasterEggRevision = currentProps.easterEggRevision;
            easterEggStartedAt = now;
          }

          const dpr = Math.min(MAX_DEVICE_PIXEL_RATIO, window.devicePixelRatio || 1);
          const displayWidth = Math.max(1, Math.round(canvas.clientWidth * dpr));
          const displayHeight = Math.max(1, Math.round(canvas.clientHeight * dpr));
          if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
          }
          gl.viewport(0, 0, canvas.width, canvas.height);

          const deltaSeconds = Math.min(1 / 20, Math.max(0, (now - previousTime) / 1_000));
          previousTime = now;
          const attention = currentProps.attentionRef.current ?? ZERO_ATTENTION;
          const attentionBlend = 1 - Math.exp(-deltaSeconds / 0.28);
          filteredAttention.x += (attention.x - filteredAttention.x) * attentionBlend;
          filteredAttention.y += (attention.y - filteredAttention.y) * attentionBlend;
          motionInput.nowMs = now;
          motionInput.gestureElapsedMs = now - gestureStartedAt;
          motionInput.state = currentProps.state;
          motionInput.gesture = currentProps.gesture;
          motionInput.idleBeat = currentProps.idleBeat;
          motionInput.attentionX = filteredAttention.x;
          motionInput.attentionY = filteredAttention.y;
          motionInput.reducedMotion = reducedMotionQuery.matches;
          motionInput.easterEggElapsedMs = currentProps.easterEggActive
            ? now - easterEggStartedAt
            : Number.POSITIVE_INFINITY;
          const target = sampleRigPose(motionInput, targetPose);
          stepSpringRig(spring, target, deltaSeconds);
          for (const id of RIG_POINT_IDS) springPose[id] = spring[id].value;
          deformMeshVertices(currentProps.currentFrame, springPose, MESH_COLUMNS, MESH_ROWS, vertices);

          gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
          const currentTexture = textures.get(textureKey(currentProps.currentOutfit, currentProps.currentFrame));
          const previousTexture = currentProps.previousFrame && currentProps.previousOutfit
            ? textures.get(textureKey(currentProps.previousOutfit, currentProps.previousFrame))
            : currentTexture;
          if (currentTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, previousTexture ?? currentTexture);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, currentTexture);
            const transitionProgress = currentProps.previousFrame
              ? (now - transitionStartedAt) / Math.max(1, currentProps.transitionDurationMs)
              : 1;
            gl.uniform1f(mixAmountLocation, easeFrameTransition(transitionProgress));
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
          }
          animationFrame = window.requestAnimationFrame(render);
        };

        animationFrame = window.requestAnimationFrame(render);
      } catch (error) {
        if (!stopped) {
          console.warn("Point-rig renderer switched to frame fallback", error);
          setReady(false);
          propsRef.current.onRendererChange?.("frame-fallback");
        }
      }
    };

    void initialize();
    return () => {
      stopped = true;
      window.cancelAnimationFrame(animationFrame);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      for (const texture of textures.values()) gl.deleteTexture(texture);
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
      if (indexBuffer) gl.deleteBuffer(indexBuffer);
      if (program) gl.deleteProgram(program);
    };
  }, [contextVersion]);

  return (
    <div
      className={`point-rig-renderer ${ready ? "is-ready" : "is-fallback"}`}
      data-renderer={ready ? "point-rig-webgl" : "frame-fallback"}
      data-transitioning={props.previousFrame ? "true" : "false"}
      data-current-frame={props.currentFrame}
      data-current-outfit={props.currentOutfit}
      data-previous-frame={props.previousFrame ?? ""}
      data-previous-outfit={props.previousOutfit ?? ""}
      data-transition-duration={props.transitionDurationMs}
      style={{ "--frame-transition-ms": `${props.transitionDurationMs}ms` } as CSSProperties}
    >
      {props.previousFrame && (
        <img
          key={`previous-${props.transitionRevision}`}
          className="point-rig-fallback point-rig-fallback-previous"
          src={getAvatarRigFrameSource(props.previousOutfit ?? props.currentOutfit, props.previousFrame)}
          alt=""
          draggable={false}
        />
      )}
      <img
        key={`current-${props.currentOutfit}-${props.currentFrame}-${props.transitionRevision}`}
        className={`point-rig-fallback point-rig-fallback-current ${props.previousFrame ? "is-transitioning" : ""}`}
        src={getAvatarRigFrameSource(props.currentOutfit, props.currentFrame)}
        alt=""
        draggable={false}
      />
      <canvas ref={canvasRef} className="point-rig-canvas" aria-hidden="true" />
    </div>
  );
}
