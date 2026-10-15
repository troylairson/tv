import { useEffect, useRef } from 'preact/hooks';

const W = 160;
const H = 90;

let audio: { ctx: AudioContext; gain: GainNode } | null = null;
let muted = false;
let audible = false;

const STATIC_VOLUME = 0.06;

function applyVolume() {
  if (audio) audio.gain.gain.setTargetAtTime(audible && !muted ? STATIC_VOLUME : 0, audio.ctx.currentTime, 0.02);
}

/** The "static sound" setting: snow still shows when muted, it's just silent. */
export function setStaticMuted(value: boolean) {
  muted = value;
  applyVolume();
}

/** Set up the static hiss. Browsers keep it silent until a button press or tap, so call this again then. */
export function initStaticAudio() {
  if (audio) {
    if (audio.ctx.state === 'suspended') void audio.ctx.resume().catch(() => undefined);
    return;
  }
  if (typeof AudioContext === 'undefined') return;
  const ctx = new AudioContext();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(gain).connect(ctx.destination);
  source.start();
  audio = { ctx, gain };
}

/** Low-res animated snow, scaled up with pixelated rendering: cheap even on a Chromecast. */
export function Static({ visible }: { visible: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    audible = visible;
    applyVolume();
    if (!visible || !canvas.current) return;
    const ctx = canvas.current.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(W, H);
    const pixels = new Uint32Array(image.data.buffer);
    let frame = 0;
    const draw = () => {
      for (let i = 0; i < pixels.length; i++) {
        const v = (Math.random() * 255) | 0;
        pixels[i] = 0xff000000 | (v << 16) | (v << 8) | v;
      }
      ctx.putImageData(image, 0, 0);
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return <canvas ref={canvas} class={`static ${visible ? 'on' : ''}`} width={W} height={H} />;
}
