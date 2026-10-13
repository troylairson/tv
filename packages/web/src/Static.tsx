import { useEffect, useRef } from 'preact/hooks';

const W = 160;
const H = 90;

let audio: { ctx: AudioContext; gain: GainNode } | null = null;

/** Must be called from a user gesture (the power button) so the browser allows audio. */
export function initStaticAudio() {
  if (audio || typeof AudioContext === 'undefined') return;
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
    if (audio) audio.gain.gain.setTargetAtTime(visible ? 0.06 : 0, audio.ctx.currentTime, 0.02);
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
