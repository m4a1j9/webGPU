import { CANVAS_SIZE } from '@shared/consts';
import { LifeContext } from '@shared/hooks';
import { KeyboardEvent, KeyboardEventHandler, RefObject, useContext, useEffect, useState } from 'react';

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
};

export const Life = (props: Props) => {
  const { canvasRef } = props;

  const life = useContext(LifeContext);

  const [isRunning, setIsRunning] = useState(false);

  const toggleSimulation = () => {
    if (!life.core) return;

    if (life.core.isRunning) {
      life.core.stop.call(life.core);
      setIsRunning(false);

      return;
    }

    life.core.run.call(life.core);
    setIsRunning(true);
  };

  const keyDownHandler = (e: globalThis.KeyboardEvent) => {
    if (!life.core) return;

    switch (e.code) {
      case 'Space':
        toggleSimulation();
    }
  };

  useEffect(() => {
    if (!life.core) return;

    life.core.renderFirstFrame();

    document.addEventListener('keydown', keyDownHandler);
  }, [life.core]);

  return (
    <section>
      <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE}></canvas>
      {!isRunning && <button onClick={toggleSimulation}>start</button>}
      {isRunning && <button onClick={toggleSimulation}>pause</button>}
    </section>
  );
};
