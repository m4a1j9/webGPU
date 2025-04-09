import { Core } from '@features/Life';
import { Life } from '@pages/Life';
import { LifeContext } from '@shared/hooks';
import { useEffect, useRef, useState } from 'react';

function App() {
  const [core, setCore] = useState<Core | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current && !core) {
      Core.create(canvasRef.current).then((core) => {
        setCore(core);
      });
    }
  }, [canvasRef.current, core]);

  return (
    <main>
      <LifeContext.Provider
        value={{
          core,
        }}
      >
        <Life canvasRef={canvasRef} />
      </LifeContext.Provider>
    </main>
  );
}

export default App;
