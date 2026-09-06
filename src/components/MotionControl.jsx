import { useStore } from '../context/StoreContext';

export default function MotionControl() {
  const { motionPaused, systemReducedMotion, toggleMotion } = useStore();
  return (
    <button
      className="motion-control"
      type="button"
      aria-pressed={motionPaused}
      aria-label={motionPaused ? 'Play site motion' : 'Pause site motion'}
      title={systemReducedMotion ? 'Motion is off because reduced motion is enabled on this device' : undefined}
      onClick={toggleMotion}
      disabled={systemReducedMotion}
    >
      <span aria-hidden="true">{motionPaused ? '▶' : 'Ⅱ'}</span>
      <span>{motionPaused ? 'Play motion' : 'Pause motion'}</span>
    </button>
  );
}
