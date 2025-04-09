import { store } from '@store';
import { CANVAS_SIZE, GRID_SIZE, UPDATE_INTERVAL, WORKGROUP_SIZE } from '@shared/consts';
import { Renderer } from './Renderer';

export class Core {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  isRunning: boolean;
  setTimeoutId: NodeJS.Timeout | null = null;
  gridStartState: Uint32Array<ArrayBuffer> = new Uint32Array(GRID_SIZE * GRID_SIZE);
  coordinateCondition = CANVAS_SIZE / GRID_SIZE;

  private constructor(canvas: HTMLCanvasElement, renderer: Renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.isRunning = false;

    this.canvas.onclick = this.clickHandler.bind(this);
  }

  static async create(canvas: HTMLCanvasElement) {
    const renderer = await Renderer.create(canvas);
    return new Core(canvas, renderer);
  }

  run() {
    if (this.isRunning) {
      this.stop();

      return;
    }

    this.isRunning = true;

    this.setTimeoutId = setInterval(this._updateGrid.bind(this, true), UPDATE_INTERVAL);
  }

  stop() {
    this.isRunning = false;
    clearInterval(this.setTimeoutId ?? 0);

    this.renderer.getCellStateData().then((state) => {
      if (!state) return;

      this.gridStartState = state;
    });
  }

  clickHandler(e: MouseEvent) {
    if (this.isRunning) return;

    const rect = this.canvas.getBoundingClientRect();

    const relativeX = Math.floor((e.clientX - rect.left) / this.coordinateCondition);
    const relativeY = Math.floor((rect.bottom - e.clientY) / this.coordinateCondition);

    const index = relativeX + relativeY * GRID_SIZE;

    this.gridStartState[index] = this.gridStartState[index] ? 0 : 1;

    this.renderer.updateGridState(this.gridStartState);

    this._updateGrid.call(this);
  }

  renderFirstFrame() {
    this.renderer.initialize(this.gridStartState).then(() => {
      this._updateGrid.call(this);
    });
  }

  private _updateGrid(stepNext = false) {
    if (
      !this.renderer.computePipelines.simulation ||
      !this.renderer.renderPipelines.cell ||
      !this.renderer.cellVertices?.length
    )
      return;

    const encoder = this.renderer.device.createCommandEncoder();

    const computePass = encoder.beginComputePass();

    computePass.setPipeline(this.renderer.computePipelines.simulation);
    computePass.setBindGroup(0, store.step % 2 ? this.renderer.bindGroups.cellA : this.renderer.bindGroups.cellB);

    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

    computePass.end();

    stepNext && store.addStep();

    this.renderer.context.configure({
      device: this.renderer.device,
      format: this.renderer.canvasFormat,
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.renderer.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
          storeOp: 'store',
        },
      ],
    });

    pass.setPipeline(this.renderer.renderPipelines.cell);
    pass.setBindGroup(0, store.step % 2 ? this.renderer.bindGroups.cellA : this.renderer.bindGroups.cellB);
    pass.setVertexBuffer(0, this.renderer.vertexBuffer);
    pass.draw(this.renderer.cellVertices.length / 2, GRID_SIZE * GRID_SIZE);

    pass.end();
    this.renderer.device.queue.submit([encoder.finish()]);
  }
}
