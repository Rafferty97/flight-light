import { useEffect, useRef, useState } from "react";
import "./App.css";
import { LongLat } from "./types";
import { createLine, formatCoords, geodesic, normaliseCoords, verticesFromCoords, vsub } from "./util";
import { loadAirports } from "./airports";

type WebGL = WebGLRenderingContext;

interface ShaderSource {
  vertex: string;
  fragment: string;
}

function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const map = useRef<Map | undefined>();
  const [rotate, setRotate] = useState(0.7);
  const [sun, setSun] = useState<LongLat>([3.6, -0.4]);
  const [src, setSrc] = useState<LongLat>([0, 0]);
  const [dst, setDst] = useState<LongLat>([0, 0]);
  const [blend, setBlend] = useState(true);

  useEffect(() => {
    if (!canvas.current) return;
    map.current ||= new Map(canvas.current);
    map.current.render(rotate, sun, src, dst, blend);
  }, [rotate, sun, src, dst, blend]);

  useEffect(() => {
    loadAirports().then((a) => {
      // const [a1, a2] = ["AKL", "YVR"];
      const [a1, a2] = ["AKL", "LIS"];
      const p1 = a.find((a) => a.code == a1);
      p1 && setSrc(p1.coords);
      const p2 = a.find((a) => a.code == a2);
      p2 && setDst(p2.coords);
    });
  }, []);

  const handleMouseMove = (ev: React.MouseEvent) => {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    const lon = 2.0 * Math.PI * ((ev.pageX - (rect.left + rect.width / 2)) / (2 * rect.height) + rotate);
    const lat = -Math.PI * ((ev.pageY - (rect.top + rect.height / 2)) / rect.height);
    setSun([lon, Math.min(Math.max(lat, -0.40910518), 0.40910518)]);
    // setDst([lon, lat]);
  };

  return (
    <div id="container">
      <div id="canvas-container">
        <canvas id="canvas" ref={canvas} onMouseMove={handleMouseMove} />
      </div>
      <div>
        <pre style={{ width: "20rem", textAlign: "center", margin: "2rem" }}>
          {formatCoords(normaliseCoords(sun), "\n")}
        </pre>
        {/* <pre>{calc}</pre> */}
        <pre style={{ width: "20rem", textAlign: "center", margin: "2rem" }}>
          {formatCoords(normaliseCoords(src), "\n")}
        </pre>
        <pre style={{ width: "20rem", textAlign: "center", margin: "2rem" }}>
          {formatCoords(normaliseCoords(dst), "\n")}
        </pre>
        <input
          type="range"
          min="1"
          max="100"
          value={(100 * rotate).toFixed(0)}
          onChange={(ev) => setRotate(parseInt(ev.target.value) / 100)}
        />
        <label>
          <input type="checkbox" checked={blend} onChange={(ev) => setBlend(ev.target.checked)} /> Blend
        </label>
      </div>
    </div>
  );
}

class Map {
  private canvas: HTMLCanvasElement;
  private gl: WebGL;
  private props: Promise<{
    mapShader: WebGLProgram;
    lineShader: WebGLProgram;
    mapBuffer: WebGLBuffer;
    lineBuffer: WebGLBuffer;
  }>;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      throw Error("WebGL not supported");
    }
    this.canvas = canvas;
    this.gl = gl;
    this.props = this.init();
  }

  async init() {
    const { gl } = this;

    const mapShader = initShader(gl, {
      vertex: await (await fetch("/map.vert")).text(),
      fragment: await (await fetch("/map.frag")).text(),
    });

    const lineShader = initShader(gl, {
      vertex: await (await fetch("/line.vert")).text(),
      fragment: await (await fetch("/line.frag")).text(),
    });

    const dayTex = await loadTexture(gl, "/earth.jpg");
    const nightTex = await loadTexture(gl, "/night.jpg");
    const strokeTex = await loadTexture(gl, "/stroke.png");
    gl.useProgram(mapShader);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dayTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, nightTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, strokeTex);
    gl.uniform1i(gl.getUniformLocation(mapShader, "uDay"), 0);
    gl.uniform1i(gl.getUniformLocation(mapShader, "uNight"), 1);
    gl.uniform1i(gl.getUniformLocation(mapShader, "uStroke"), 2);

    const mapBuffer = gl.createBuffer();
    if (!mapBuffer) throw Error("Cannot create buffer");
    gl.useProgram(lineShader);
    gl.bindBuffer(gl.ARRAY_BUFFER, mapBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, -1, -1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const lineBuffer = gl.createBuffer();
    if (!lineBuffer) throw Error("Cannot create buffer");

    return { mapShader, lineShader, mapBuffer, lineBuffer };
  }

  async render(rotate: number, sun: LongLat, src: LongLat, dst: LongLat, blend: boolean) {
    const { canvas, gl } = this;
    const props = await this.props;

    if (resizeCanvasToDisplaySize(canvas)) {
      // gl.viewport(0, 0, canvas.width, canvas.height);
      const [wid, hei] = [2 * canvas.height, canvas.height];
      gl.viewport((canvas.width - wid) / 2, (canvas.height - hei) / 2, wid, hei);
    }
    const width = 5 / canvas.height;

    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(props.mapShader);
    const vertexPosition = gl.getAttribLocation(props.mapShader, "aVertexPosition");
    gl.bindBuffer(gl.ARRAY_BUFFER, props.mapBuffer);
    gl.vertexAttribPointer(vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vertexPosition);
    gl.uniform2fv(gl.getUniformLocation(props.mapShader, "uSun"), sun);
    gl.uniform1f(gl.getUniformLocation(props.mapShader, "uRotate"), rotate);
    gl.uniform1i(gl.getUniformLocation(props.mapShader, "uBlend"), +blend);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.useProgram(props.lineShader);
    const vertexPosition2 = gl.getAttribLocation(props.lineShader, "aVertexPosition");
    gl.bindBuffer(gl.ARRAY_BUFFER, props.lineBuffer);
    const src2 = vsub(src, [2 * Math.PI * rotate, 0]);
    const dst2 = vsub(dst, [2 * Math.PI * rotate, 0]);

    const linePoints = createLine(verticesFromCoords(geodesic(src2, dst2, 0.05)), width);
    gl.bufferData(gl.ARRAY_BUFFER, linePoints, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(vertexPosition2);
    gl.uniform4fv(gl.getUniformLocation(props.lineShader, "uColor"), [0, 1, 1, 1]);
    gl.vertexAttribPointer(vertexPosition2, 2, gl.FLOAT, false, 0, 0);
    for (const offset of [0, -1, 1]) {
      gl.uniform1f(gl.getUniformLocation(props.lineShader, "uOffset"), offset);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, linePoints.length / 2);
    }
  }
}

function initShader(gl: WebGL, shader: ShaderSource): WebGLProgram {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, shader.vertex);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, shader.fragment);

  // Create the shader program
  const shaderProgram = gl.createProgram();
  if (!shaderProgram) {
    throw Error("Unable to create shader program");
  }

  // Attach the vertex and fragment shaders to the program
  if (vertexShader) gl.attachShader(shaderProgram, vertexShader);
  if (fragmentShader) gl.attachShader(shaderProgram, fragmentShader);

  // Link the program
  gl.linkProgram(shaderProgram);

  // Check if program linking was successful
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    throw Error("Unable to initialize the shader program: " + gl.getProgramInfoLog(shaderProgram));
  }

  return shaderProgram;
}

function loadShader(gl: WebGL, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    console.error("Unable to create shader");
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  // Check if shader compilation was successful
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

async function loadTexture(gl: WebGL, url: string): Promise<WebGLTexture> {
  return new Promise((res) => {
    const texture = gl.createTexture();
    if (!texture) throw Error("Cannot create texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const level = 0;
    const internalFormat = gl.RGBA;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;

    const image = new Image();
    image.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      res(texture);
    };
    image.src = url;
  });
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement): boolean {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * dpr;
  const height = canvas.clientHeight * dpr;
  const needResize = canvas.width !== width || canvas.height !== height;

  if (needResize) {
    canvas.width = 2 * width;
    canvas.height = 2 * height;
  }

  return needResize;
}

export default App;
