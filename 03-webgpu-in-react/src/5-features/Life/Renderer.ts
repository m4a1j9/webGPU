import cellShader from '@shared/assets/shaders/life/cellShaderModule.wgsl?raw';
import simulationShaderRaw from '@shared/assets/shaders/life/simulationShaderModule.wgsl?raw';
import hoverShader from '@shared/assets/shaders/life/hoverShaderModule.wgsl?raw';
import { RenderPipelineTypes } from '@entities/Life/models/RenderPipelineTypes';
import { ComputePipelineTypes } from '@entities/Life/models/ComputePipelineTypes';
import { BindGroups } from '@entities/Life/models/BindGroups';
import { GRID_SIZE, WORKGROUP_SIZE } from '@shared/consts';
import {
  BindGroupBuilder,
  BindGroupLayoutBuilder,
  ComputePipelineBuilder,
  RenderPipelineBuilder,
} from '@builders/Life';
import { store } from '@store';
import { HOVER_SQUARE_SIZE } from '@shared/consts/PRIMITIVES';

export class Renderer {
  canvas: HTMLCanvasElement;
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  canvasFormat: GPUTextureFormat;

  cellVertices: Float32Array<ArrayBuffer> | null = null;
  hoverVertices: Float32Array<ArrayBuffer> | null = null;

  renderPipelines: Record<RenderPipelineTypes, GPURenderPipeline | null>;
  gridBuffer: GPUBuffer | null = null;
  cellVertexBuffer: GPUBuffer | null = null;
  hoverVertexBuffer: GPUBuffer | null = null;
  hoverUniformBuffer: GPUBuffer | null = null;
  cellStateStorageA: GPUBuffer | null = null;
  cellStateStorageB: GPUBuffer | null = null;
  readBuffer: GPUBuffer | null = null;

  computePipelines: Record<ComputePipelineTypes, GPUComputePipeline | null>;

  bindGroups: Record<BindGroups, GPUBindGroup | null>;
  bindGroupLayouts: Record<RenderPipelineTypes, GPUBindGroupLayout | null>;

  hoverUniformData = new Float32Array(3 * 2);

  private constructor(
    canvas: HTMLCanvasElement,
    adapter: GPUAdapter,
    device: GPUDevice,
    context: GPUCanvasContext,
    canvasFormat: GPUTextureFormat,
  ) {
    this.canvas = canvas;
    this.adapter = adapter;
    this.device = device;
    this.context = context;
    this.canvasFormat = canvasFormat;

    this.renderPipelines = {
      cell: null,
      hover: null,
    };
    this.computePipelines = {
      simulation: null,
    };

    this.bindGroups = {
      cellA: null,
      cellB: null,
      hover: null,
    };
    this.bindGroupLayouts = {
      cell: null,
      hover: null,
    };
  }

  static async create(canvas: HTMLCanvasElement) {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('No GPU adapter found');

    const device = await adapter.requestDevice();
    if (!device) throw new Error('Could not get GPU device');

    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('Could not get WebGPU context');

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
      device: device,
      format: canvasFormat,
    });

    return new Renderer(canvas, adapter, device, context, canvasFormat);
  }

  async initialize(gridState: Uint32Array<ArrayBuffer>) {
    await this._createAssets(gridState);

    await this._makeBindGroupLayouts();

    await this._makeBindGroups();

    await this._makePipelines();

    this._makeReadBuffer();
  }

  async getCellStateData() {
    if (!this.cellStateStorageA || !this.cellStateStorageB) return null;
    if (!this.readBuffer) return null;

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      store.step % 2 ? this.cellStateStorageB : this.cellStateStorageA,
      0,
      this.readBuffer,
      0,
      this.cellStateStorageA.size,
    );

    const commandBuffer = encoder.finish();
    this.device.queue.submit([commandBuffer]);

    await this.readBuffer.mapAsync(GPUMapMode.READ);
    const data = new Uint32Array(this.readBuffer.getMappedRange().slice(0));
    this.readBuffer.unmap();

    return data;
  }

  private _makeReadBuffer() {
    if (!this.cellStateStorageA) return null;

    this.readBuffer = this.device.createBuffer({
      label: 'Read Buffer',
      size: this.cellStateStorageA.size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  updateGridState(gridState: Uint32Array<ArrayBuffer>) {
    if (!this.cellStateStorageA || !this.cellStateStorageB) return;

    this.device.queue.writeBuffer(store.step % 2 ? this.cellStateStorageB : this.cellStateStorageA, 0, gridState);
  }

  private async _createAssets(gridState: Uint32Array<ArrayBuffer>) {
    this._createSimulationAssetcs(gridState);
    this._createHoverAssets();
  }

  private async _makeBindGroupLayouts() {
    var builder = new BindGroupLayoutBuilder(this.device);

    // Grid uniform buffer
    builder.addLayoutEntry(GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE);
    builder.addLayoutEntry(
      GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
      'read-only-storage',
    );
    builder.addLayoutEntry(GPUShaderStage.COMPUTE, 'storage');
    this.bindGroupLayouts.cell = await builder.build('Cell Bind Group Layout');

    // Hover uniform buffer
    builder.addLayoutEntry(GPUShaderStage.VERTEX);
    this.bindGroupLayouts.hover = await builder.build('Hover Bind Group Layout');
  }

  private async _makeBindGroups() {
    if (!this.bindGroupLayouts.cell) throw new Error();
    if (!this.gridBuffer || !this.cellStateStorageA || !this.cellStateStorageB) throw new Error();

    var builder = new BindGroupBuilder(this.device);

    builder.addEntry(this.gridBuffer);
    builder.addEntry(this.cellStateStorageA);
    builder.addEntry(this.cellStateStorageB);
    this.bindGroups.cellB = await builder.build('Cell Renderer Bind Group A', this.bindGroupLayouts.cell);

    builder.addEntry(this.gridBuffer);
    builder.addEntry(this.cellStateStorageB);
    builder.addEntry(this.cellStateStorageA);
    this.bindGroups.cellA = await builder.build('Cell Renderer Bind Group B', this.bindGroupLayouts.cell);

    if (!this.hoverUniformBuffer || !this.bindGroupLayouts.hover) throw new Error();

    builder.addEntry(this.hoverUniformBuffer);
    this.bindGroups.hover = await builder.build('Hover Bind Group', this.bindGroupLayouts.hover);
  }

  private async _makePipelines() {
    if (!this.bindGroupLayouts.cell) throw new Error();

    const renderPipelineBuilder = new RenderPipelineBuilder(this.device);

    renderPipelineBuilder.addBindGroupLayout(this.bindGroupLayouts.cell);
    renderPipelineBuilder.addRenderTarget(this.canvasFormat);
    renderPipelineBuilder.addVertexBufferDescription({
      arrayStride: 4 * 2,
      attributes: [
        {
          format: 'float32x2',
          offset: 0,
          shaderLocation: 0,
        },
      ],
    });
    const cellShaderModule = this.device.createShaderModule({
      label: 'Cell shader',
      code: cellShader,
    });

    this.renderPipelines.cell = await renderPipelineBuilder.build(
      'Cell Pipeline Layout',
      'Cell Pipeline',
      cellShaderModule,
    );

    const computePipelineBuilder = new ComputePipelineBuilder(this.device);

    computePipelineBuilder.addBindGroupLayout(this.bindGroupLayouts.cell);
    const simulationShader = simulationShaderRaw
      .replace('WORKGROUP_SIZE_X_TEMP', String(WORKGROUP_SIZE))
      .replace('WORKGROUP_SIZE_Y_TEMP', String(WORKGROUP_SIZE));
    const simulationShaderModule = this.device.createShaderModule({
      label: 'Life simulation shader',
      code: simulationShader,
    });
    this.computePipelines.simulation = await computePipelineBuilder.build(
      'Simulation Pipeline Layout',
      'Simulation Pipeline',
      simulationShaderModule,
    );

    if (!this.bindGroupLayouts.hover) throw new Error();

    renderPipelineBuilder.addBindGroupLayout(this.bindGroupLayouts.hover);
    renderPipelineBuilder.addRenderTarget(this.canvasFormat);
    renderPipelineBuilder.addVertexBufferDescription({
      arrayStride: 4 * 2,
      attributes: [
        {
          format: 'float32x2',
          offset: 0,
          shaderLocation: 0,
        },
      ],
    });

    const hoverShaderModule = this.device.createShaderModule({
      label: 'Hover shader',
      code: hoverShader,
    });
    this.renderPipelines.hover = await renderPipelineBuilder.build(
      'Hover Pipeline Layout',
      'Hover Pipeline',
      hoverShaderModule,
    );
  }

  private _createSimulationAssetcs(gridState: Uint32Array<ArrayBuffer>) {
    const grid = new Float32Array([GRID_SIZE, GRID_SIZE]);
    this.gridBuffer = this.device.createBuffer({
      label: 'Grid Uniforms',
      size: grid.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.gridBuffer, 0, grid);

    // prettier-ignore
    this.cellVertices = new Float32Array([
      -0.8, -0.8,
       0.8, -0.8,
       0.8,  0.8,

      -0.8, -0.8,
       0.8,  0.8,
      -0.8,  0.8,
    ]);
    this.cellVertexBuffer = this.device.createBuffer({
      label: 'Cell vertices',
      size: this.cellVertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.cellVertexBuffer, 0, this.cellVertices);

    this.cellStateStorageA = this.device.createBuffer({
      label: 'Cell State A',
      size: gridState.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.cellStateStorageB = this.device.createBuffer({
      label: 'Cell State B',
      size: gridState.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    for (let i = 0; i < gridState.length; ++i) {
      gridState[i] = Math.random() > 0.6 ? 1 : 0;
    }
    this.device.queue.writeBuffer(this.cellStateStorageA, 0, gridState);
    this.device.queue.writeBuffer(this.cellStateStorageB, 0, gridState);
  }

  private _createHoverAssets() {
    // pos.x, pos.y, size.x, size.y, gridSize.x, gridSize.y
    this.hoverUniformData[2] = HOVER_SQUARE_SIZE;
    this.hoverUniformData[3] = HOVER_SQUARE_SIZE;
    this.hoverUniformData[4] = GRID_SIZE;
    this.hoverUniformData[5] = GRID_SIZE;

    this.hoverUniformBuffer = this.device.createBuffer({
      label: 'Hover Uniforms',
      size: this.hoverUniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.hoverUniformBuffer, 0, this.hoverUniformData)

    // prettier-ignore
    this.hoverVertices = new Float32Array([
      -0.9, -0.9,
       0.9, -0.9,
       0.9,  0.9,

      -0.9, -0.9,
       0.9,  0.9,
      -0.9,  0.9,
    ]);
    this.hoverVertexBuffer = this.device.createBuffer({
      label: 'Hover square vertices',
      size: this.hoverVertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.hoverVertexBuffer, 0, this.hoverVertices);
  }
}
