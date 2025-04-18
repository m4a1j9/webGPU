import { store } from '@store';
import { CANVAS_SIZE, GRID_SIZE, UPDATE_INTERVAL, WORKGROUP_SIZE } from '@shared/consts';
import { Renderer } from './Renderer';

type HoverCoords = {
  x: number;
  y: number;
};

export class Core {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  isRunning: boolean;
  setTimeoutId: NodeJS.Timeout | null = null;
  gridStartState: Uint32Array<ArrayBuffer> = new Uint32Array(GRID_SIZE * GRID_SIZE);
  coordinateCondition = CANVAS_SIZE / GRID_SIZE;

  hoverCoords: HoverCoords | null = null;

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

  onHover(hoverCoords: HoverCoords | null) {
    if (this.isRunning) return;

    this.hoverCoords = hoverCoords;

    this._updateHover(hoverCoords ?? { x:   0, y: 0 });
  }

  private _updateHover(hoverPos: HoverCoords) {
    if (!this.renderer.renderPipelines.hover || !this.renderer.cellVertices?.length) throw new Error();
    if (!this.renderer.hoverVertices?.length) throw new Error();

    if (!this.renderer.hoverPositionBuffer) throw new Error();

    const pos = new Float32Array([hoverPos.x, hoverPos.y]);
    this.renderer.device.queue.writeBuffer(this.renderer.hoverPositionBuffer, 0, pos);

    const encoder = this.renderer.device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
      label: 'Hover Render Pass',
      colorAttachments: [
        {
          view: this.renderer.context.getCurrentTexture().createView(),
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
    });

    pass.setPipeline(this.renderer.renderPipelines.hover);
    pass.setBindGroup(0, this.renderer.bindGroups.hover);
    pass.setVertexBuffer(0, this.renderer.hoverVertexBuffer);
    pass.draw(this.renderer.hoverVertices.length / 2, 1);

    pass.end();
    this.renderer.device.queue.submit([encoder.finish()]);
  }

  private _updateGrid(stepNext = false) {
    if (
      !this.renderer.computePipelines.simulation ||
      !this.renderer.renderPipelines.cell ||
      !this.renderer.cellVertices?.length
    )
      throw new Error();

    const encoder = this.renderer.device.createCommandEncoder();

    const computePass = encoder.beginComputePass();

    computePass.setPipeline(this.renderer.computePipelines.simulation);
    computePass.setBindGroup(0, store.step % 2 ? this.renderer.bindGroups.cellA : this.renderer.bindGroups.cellB);

    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

    computePass.end();

    stepNext && store.addStep();

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
    pass.setVertexBuffer(0, this.renderer.cellVertexBuffer);
    pass.draw(this.renderer.cellVertices.length / 2, GRID_SIZE * GRID_SIZE);

    pass.end();
    this.renderer.device.queue.submit([encoder.finish()]);
  }
}
