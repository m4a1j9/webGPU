import { RenderPipelineTypes } from '../6-models/RenderPipelineTypes';
import { RenderPipelineBuilder } from '../7-shared/RenderPipelineBuilder';
import cellShader from '../3-shaders/cellShaderModule.wgsl?raw';
import simulationShaderRaw from '../3-shaders/simulationShaderModule.wgsl?raw';
import { BindGroupLayoutBuilder } from '../7-shared/BindGroupLayoutBuilder';
import { BindGroupBuilder } from '../7-shared/BindGroupBuilder';
import { GRID_SIZE, WORKGROUP_SIZE } from '../7-shared/consts/PRIMITIVES';
import { ComputePipelineBuilder } from '../7-shared/ComputePipelineBuilder';
import { ComputePipelineTypes } from '../6-models/ComputePipelineTypes';
import { store } from '../5-store/store';
import { BindGroups } from '../6-models/BindGroups';

export class Renderer {
  canvas: HTMLCanvasElement;
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  canvasFormat: GPUTextureFormat;

  cellVertices: Float32Array<ArrayBuffer> | null = null;

  renderPipelines: Record<RenderPipelineTypes, GPURenderPipeline | null>;
  uniformBuffer: GPUBuffer | null = null;
  vertexBuffer: GPUBuffer | null = null;
  cellStateStorageA: GPUBuffer | null = null;
  cellStateStorageB: GPUBuffer | null = null;

  computePipelines: Record<ComputePipelineTypes, GPUComputePipeline | null>;

  bindGroups: Record<BindGroups, GPUBindGroup | null>;
  bindGroupLayouts: Record<RenderPipelineTypes, GPUBindGroupLayout | null>;

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
    };
    this.computePipelines = {
      simulation: null,
    };

    this.bindGroups = {
      cellA: null,
      cellB: null,
    };
    this.bindGroupLayouts = {
      cell: null,
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

  async initialize() {
    await this.createAssets();

    await this.makeBindGroupLayouts();

    await this.makeBindGroups();

    await this.makePipelines();
  }

  async createAssets() {
    const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
    this.uniformBuffer = this.device.createBuffer({
      label: 'Grid Uniforms',
      size: uniformArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

    // prettier-ignore
    this.cellVertices = new Float32Array([
      // X,   Y,
      -0.8, -0.8, // Triangle 1 (Blue)
       0.8, -0.8,
       0.8,  0.8,

      -0.8, -0.8, // Triangle 2 (Red)
       0.8,  0.8,
      -0.8,  0.8,
    ]);
    this.vertexBuffer = this.device.createBuffer({
      label: 'Cell vertices',
      size: this.cellVertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, this.cellVertices);

    const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);

    this.cellStateStorageA = this.device.createBuffer({
      label: 'Cell State A',
      size: cellStateArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.cellStateStorageB = this.device.createBuffer({
      label: 'Cell State B',
      size: cellStateArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    for (let i = 0; i < cellStateArray.length; ++i) {
      cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
    }
    this.device.queue.writeBuffer(this.cellStateStorageA, 0, cellStateArray);

    for (let i = 0; i < cellStateArray.length; i++) {
      cellStateArray[i] = i % 2;
    }
    this.device.queue.writeBuffer(this.cellStateStorageB, 0, cellStateArray);
  }

  async makeBindGroupLayouts() {
    var builder = new BindGroupLayoutBuilder(this.device);

    builder.addLayoutEntry(GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE);
    builder.addLayoutEntry(
      GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
      'read-only-storage',
    );
    builder.addLayoutEntry(GPUShaderStage.COMPUTE, 'storage');
    this.bindGroupLayouts.cell = await builder.build('Cell Bind Group Layout');
  }

  async makeBindGroups() {
    if (!this.bindGroupLayouts.cell) return;
    if (!this.uniformBuffer || !this.cellStateStorageA || !this.cellStateStorageB) return;

    var builder = new BindGroupBuilder(this.device);

    builder.addEntry(this.uniformBuffer);
    builder.addEntry(this.cellStateStorageA);
    builder.addEntry(this.cellStateStorageB);
    this.bindGroups.cellB = await builder.build('Cell renderer bind group A', this.bindGroupLayouts.cell);

    builder.addEntry(this.uniformBuffer);
    builder.addEntry(this.cellStateStorageB);
    builder.addEntry(this.cellStateStorageA);
    this.bindGroups.cellA = await builder.build('Cell renderer bind group B', this.bindGroupLayouts.cell);
  }

  async makePipelines() {
    if (!this.bindGroupLayouts.cell) return;

    const renderPipelineBuilder = new RenderPipelineBuilder(this.device);

    renderPipelineBuilder.addBindGroupLayout(this.bindGroupLayouts.cell);
    renderPipelineBuilder.addRenderTarget(this.canvasFormat);
    renderPipelineBuilder.addVertexBufferDescription({
      arrayStride: 8,
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
      'Cell pipeline',
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
      'Simulation pipeline',
      simulationShaderModule,
    );
  }
}
