<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { animationPreferences, shouldReduceAnimations } from '$lib/stores/animations';

  export let isVisible = false;
  export let winningPaylines: Array<{
    paylineIndex: number;
    payline: number[];
    symbol: string;
    count: number;
    multiplier: number;
  }> = [];
  export let containerElement: HTMLElement | null = null;
  
  let gameGridElement: HTMLElement | null = null;

  let canvas: HTMLCanvasElement;
  let gl: WebGLRenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let animationFrame: number | null = null;
  let startTime = 0;
  let isInitialized = false;

  // WebGL shader sources
  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute float a_time_offset;
    attribute vec3 a_color;
    
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_line_width;
    
    varying vec3 v_color;
    varying float v_alpha;
    
    void main() {
      // Convert from pixels to clip space
      vec2 clipSpace = ((a_position / u_resolution) * 2.0) - 1.0;
      gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
      
      // Animate line appearance with wave effect
      float wave_time = u_time - a_time_offset;
      float glow_intensity = 0.5 + 0.5 * sin(wave_time * 3.0);
      v_alpha = smoothstep(0.0, 1.0, wave_time) * glow_intensity;
      v_color = a_color;
      
      gl_PointSize = u_line_width;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    
    varying vec3 v_color;
    varying float v_alpha;
    
    void main() {
      gl_FragColor = vec4(v_color, v_alpha);
    }
  `;

  // Subscription to animation preferences
  $: preferences = $animationPreferences;
  $: reduceMotion = $shouldReduceAnimations;

  $: if (isVisible && winningPaylines.length > 0) {
    findGameGrid();
    startRendering();
  } else {
    stopRendering();
  }

  onMount(() => {
    initWebGL();
  });

  function findGameGrid() {
    // Find the game grid element by class name
    gameGridElement = document.querySelector('.game-grid') as HTMLElement;
    if (!gameGridElement) {
      console.warn('Could not find .game-grid element for win line positioning');
    }
  }

  onDestroy(() => {
    cleanup();
  });

  function initWebGL() {
    if (!canvas) return;

    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      console.warn('WebGL not supported, falling back to canvas rendering');
      return;
    }

    // Create and compile shaders
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) {
      console.error('Failed to create shaders');
      return;
    }

    // Create and link program
    program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) {
      console.error('Failed to create WebGL program');
      return;
    }

    isInitialized = true;
  }

  function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program linking error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  function startRendering() {
    if (!isInitialized || !gl || !program || !containerElement) return;

    // Get the celebration container bounds
    const containerRect = containerElement.getBoundingClientRect();
    
    // Find game grid to calculate offset
    findGameGrid();
    if (!gameGridElement) return;
    
    const gameRect = gameGridElement.getBoundingClientRect();
    
    // Set canvas to full container size
    canvas.width = containerRect.width;
    canvas.height = containerRect.height;
    canvas.style.width = `${containerRect.width}px`;
    canvas.style.height = `${containerRect.height}px`;

    startTime = Date.now();
    
    if (!animationFrame) {
      animate();
    }
  }

  function stopRendering() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  function animate() {
    if (!gl || !program || !isVisible) return;

    const currentTime = (Date.now() - startTime) / 1000.0;
    
    // Set up WebGL context
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Enable blending for glow effects
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    gl.useProgram(program);

    // Set uniforms
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const lineWidthLocation = gl.getUniformLocation(program, 'u_line_width');

    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(timeLocation, currentTime);
    gl.uniform1f(lineWidthLocation, reduceMotion ? 2.0 : 4.0);

    // Render each winning payline
    winningPaylines.forEach((winningPayline, index) => {
      renderPayline(winningPayline, index, currentTime);
    });

    if (isVisible) {
      animationFrame = requestAnimationFrame(animate);
    }
  }

  function renderPayline(winningPayline: any, index: number, currentTime: number) {
    if (!gl || !program || !containerElement) return;

    const { payline, symbol, paylineIndex } = winningPayline;
    
    // Generate line path through the reel grid
    const linePoints = generateLinePoints(payline);
    if (linePoints.length < 2) return;

    // Create color based on symbol rarity
    const color = getSymbolColor(symbol);
    const timeOffset = index * 0.3; // Stagger line animations

    // Create vertex data
    const vertices = [];
    const colors = [];
    const timeOffsets = [];

    for (let i = 0; i < linePoints.length - 1; i++) {
      const start = linePoints[i];
      const end = linePoints[i + 1];
      
      // Create line segments as triangles for better control
      const thickness = reduceMotion ? 3 : 5;
      const perpX = -(end.y - start.y) / Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2) * thickness;
      const perpY = (end.x - start.x) / Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2) * thickness;

      // Triangle 1
      vertices.push(start.x - perpX, start.y - perpY);
      vertices.push(start.x + perpX, start.y + perpY);
      vertices.push(end.x - perpX, end.y - perpY);
      
      // Triangle 2
      vertices.push(start.x + perpX, start.y + perpY);
      vertices.push(end.x + perpX, end.y + perpY);
      vertices.push(end.x - perpX, end.y - perpY);

      // Add colors and time offsets for each vertex
      for (let j = 0; j < 6; j++) {
        colors.push(...color);
        timeOffsets.push(timeOffset);
      }
    }

    // Create and bind buffers
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    const timeOffsetBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, timeOffsetBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(timeOffsets), gl.STATIC_DRAW);

    // Set up attributes
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const colorLocation = gl.getAttribLocation(program, 'a_color');
    const timeOffsetLocation = gl.getAttribLocation(program, 'a_time_offset');

    // Bind position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Bind color attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

    // Bind time offset attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, timeOffsetBuffer);
    gl.enableVertexAttribArray(timeOffsetLocation);
    gl.vertexAttribPointer(timeOffsetLocation, 1, gl.FLOAT, false, 0, 0);

    // Draw the line
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);

    // Clean up buffers
    gl.deleteBuffer(positionBuffer);
    gl.deleteBuffer(colorBuffer);
    gl.deleteBuffer(timeOffsetBuffer);
  }

  function generateLinePoints(payline: number[]): Array<{x: number, y: number}> {
    if (!gameGridElement || !containerElement) return [];

    const gameRect = gameGridElement.getBoundingClientRect();
    const containerRect = containerElement.getBoundingClientRect();
    
    // Calculate offset from celebration container to game grid
    const offsetX = gameRect.left - containerRect.left;
    const offsetY = gameRect.top - containerRect.top;
    
    const cellWidth = gameRect.width / 5; // 5 reels
    const cellHeight = gameRect.height / 3; // 3 rows

    const points = [];
    
    for (let col = 0; col < 5; col++) {
      const row = payline[col];
      // Position relative to celebration container but targeting game grid
      const x = offsetX + (col * cellWidth) + (cellWidth / 2);
      const y = offsetY + (row * cellHeight) + (cellHeight / 2);
      points.push({ x, y });
    }

    return points;
  }

  function getSymbolColor(symbol: string): number[] {
    const colors = {
      'A': [1.0, 0.84, 0.0], // Gold
      'B': [0.75, 0.75, 0.75], // Silver  
      'C': [0.8, 0.5, 0.2], // Bronze
      'D': [0.2, 0.8, 0.2], // Green
    };
    return colors[symbol] || [1.0, 1.0, 1.0]; // Default white
  }

  function cleanup() {
    stopRendering();
    if (gl && program) {
      gl.deleteProgram(program);
    }
    gl = null;
    program = null;
    isInitialized = false;
  }
</script>

<canvas
  bind:this={canvas}
  class="win-line-renderer"
  class:visible={isVisible}
  aria-hidden="true"
></canvas>

<style>
  .win-line-renderer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 15;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .win-line-renderer.visible {
    opacity: 1;
  }

  /* Fallback for browsers without WebGL */
  .win-line-renderer:not(.webgl-supported) {
    background: transparent;
  }
</style>