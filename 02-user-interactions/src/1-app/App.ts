import { Renderer } from '../2-/Renderer';
import { store } from '../5-store/store';
import { GRID_SIZE, UPDATE_INTERVAL, WORKGROUP_SIZE } from '../7-shared/consts/PRIMITIVES';

export class App {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  isRunning: boolean;

  private constructor(canvas: HTMLCanvasElement, renderer: Renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.isRunning = false;
  }

  static async create(canvas: HTMLCanvasElement): Promise<App> {
    const renderer = await Renderer.create(canvas);
    return new App(canvas, renderer);
  }

  run() {
    this.isRunning = true;

    this.renderer.initialize().then(() => {
      this._renderNext();
    });
  }

  stop() {
    this.isRunning = false;
  }

  private _renderNext() {
    if (!this.isRunning) return;

    setInterval(this.updateGrid.bind(this), UPDATE_INTERVAL);
  }

  private updateGrid() {
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

    store.addStep();

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
