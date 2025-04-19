import { store } from '@store';
import { CANVAS_SIZE, GRID_SIZE, UPDATE_INTERVAL, WORKGROUP_SIZE } from '@shared/consts';
import { Renderer } from './Renderer';
import { MouseEvent } from 'react';

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
  }

  static async create(canvas: HTMLCanvasElement) {
    const renderer = await Renderer.create(canvas);
    return new Core(canvas, renderer);
  }

  run() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    this.setTimeoutId = setInterval(this._simulationStep.bind(this, true), UPDATE_INTERVAL);
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

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
  }

  renderFirstFrame() {
    this.renderer
      .initialize(this.gridStartState)
      .then(() => {
        this._simulationStep.call(this);
      })
      .then(() => {
        this._renderLoop.call(this);
      });
  }

  onHover(hoverCoords: HoverCoords | null) {
    if (hoverCoords === null) {
      this.hoverCoords = hoverCoords;
      return;
    }

    this.hoverCoords = {} as HoverCoords;

    const rect = this.canvas.getBoundingClientRect();
    const canvasX = hoverCoords.x - rect.left;
    const canvasY = hoverCoords.y - rect.top;
    this.hoverCoords.x = (canvasX / this.canvas.width) * 2 - 1;
    this.hoverCoords.y = (canvasY / this.canvas.height) * -2 + 1;
  }

  private _simulationStep(stepNext = false) {
    if (!this.renderer.computePipelines.simulation) throw new Error();

    const simulationEncoder = this.renderer.device.createCommandEncoder({
      label: 'Simulation Encoder',
    });

    const computePass = simulationEncoder.beginComputePass({
      label: 'Game of Life Compute Pass',
    });
    computePass.setPipeline(this.renderer.computePipelines.simulation);

    computePass.setBindGroup(0, store.step % 2 ? this.renderer.bindGroups.cellA : this.renderer.bindGroups.cellB);
    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    computePass.end();

    this.renderer.device.queue.submit([simulationEncoder.finish()]);

    stepNext && store.addStep();
  }

  private _renderLoop() {
    if (
      !this.renderer.renderPipelines.cell ||
      !this.renderer.cellVertices?.length ||
      !this.renderer.hoverUniformBuffer ||
      !this.renderer.renderPipelines.hover ||
      !this.renderer.hoverVertices
    )
      throw new Error();

    const renderEncoder = this.renderer.device.createCommandEncoder({
      label: 'Render Encoder',
    });

    const renderPass = renderEncoder.beginRenderPass({
      label: 'Main Render Pass',
      colorAttachments: [
        {
          view: this.renderer.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(this.renderer.renderPipelines.cell);

    renderPass.setBindGroup(0, store.step % 2 ? this.renderer.bindGroups.cellA : this.renderer.bindGroups.cellB);
    renderPass.setVertexBuffer(0, this.renderer.cellVertexBuffer);
    renderPass.draw(this.renderer.cellVertices.length / 2, GRID_SIZE * GRID_SIZE);

    if (this.hoverCoords) {
      this.renderer.hoverUniformData[0] = this.hoverCoords.x;
      this.renderer.hoverUniformData[1] = this.hoverCoords.y;
      // Обновляем только X, Y
      this.renderer.device.queue.writeBuffer(this.renderer.hoverUniformBuffer, 0, this.renderer.hoverUniformData);

      renderPass.setPipeline(this.renderer.renderPipelines.hover);
      renderPass.setBindGroup(0, this.renderer.bindGroups.hover);
      renderPass.setVertexBuffer(0, this.renderer.hoverVertexBuffer);
      renderPass.draw(this.renderer.hoverVertices.length / 2, 1);
    }

    renderPass.end();

    this.renderer.device.queue.submit([renderEncoder.finish()]);

    requestAnimationFrame(this._renderLoop.bind(this));
  }
}
