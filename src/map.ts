import { LongLat } from './types'
import { createCircle, createLine, geodesic, makeMat, verticesFromCoords, vsub } from './util'

type WebGL = WebGLRenderingContext

interface ShaderSource {
  vertex: string
  fragment: string
}

export class Map {
  private canvas: HTMLCanvasElement
  private gl: WebGL
  private props: Promise<{
    mapShader: WebGLProgram
    lineShader: WebGLProgram
    mapBuffer: WebGLBuffer
    lineBuffer: WebGLBuffer
    sunBuffer: WebGLBuffer
  }>
  private params = {
    rotate: 0,
    sun: undefined as LongLat | undefined,
    src: [0, 0] as LongLat,
    loc: [0, 0] as LongLat,
    dst: [0, 0] as LongLat,
  }
  blend = true
  showSun = false

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2')
    if (!gl) {
      throw Error('WebGL not supported')
    }
    this.canvas = canvas
    this.gl = gl
    this.props = this.init()
  }

  async init() {
    const { gl } = this

    const mapShader = initShader(gl, {
      vertex: await (await fetch(`${import.meta.env.BASE_URL}map.vert`)).text(),
      fragment: await (await fetch(`${import.meta.env.BASE_URL}map.frag`)).text(),
    })

    const lineShader = initShader(gl, {
      vertex: await (await fetch(`${import.meta.env.BASE_URL}line.vert`)).text(),
      fragment: await (await fetch(`${import.meta.env.BASE_URL}line.frag`)).text(),
    })

    const dayTex = await loadTexture(gl, `${import.meta.env.BASE_URL}earth.jpg`.toString())
    const nightTex = await loadTexture(gl, `${import.meta.env.BASE_URL}night.jpg`.toString())
    const strokeTex = await loadTexture(gl, `${import.meta.env.BASE_URL}stroke.png`.toString())
    gl.useProgram(mapShader)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, dayTex)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, nightTex)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, strokeTex)
    gl.uniform1i(gl.getUniformLocation(mapShader, 'uDay'), 0)
    gl.uniform1i(gl.getUniformLocation(mapShader, 'uNight'), 1)
    gl.uniform1i(gl.getUniformLocation(mapShader, 'uStroke'), 2)

    const mapBuffer = gl.createBuffer()
    if (!mapBuffer) throw Error('Cannot create buffer')
    gl.useProgram(lineShader)
    gl.bindBuffer(gl.ARRAY_BUFFER, mapBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, -1, -1, 1, -1, 1, 1]), gl.STATIC_DRAW)

    const lineBuffer = gl.createBuffer()
    if (!lineBuffer) throw Error('Cannot create buffer')

    const sunBuffer = gl.createBuffer()
    if (!sunBuffer) throw Error('Cannot create buffer')
    gl.bindBuffer(gl.ARRAY_BUFFER, sunBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, createCircle([0, 0], 1, 12), gl.DYNAMIC_DRAW)

    return { mapShader, lineShader, mapBuffer, lineBuffer, sunBuffer }
  }

  async setParams(rotate: number, sun: LongLat | undefined, src: LongLat, loc: LongLat, dst: LongLat) {
    this.params = { rotate, sun, src, loc, dst }
  }

  async render() {
    const { canvas, gl } = this
    const { rotate, src, loc, dst } = this.params
    const sun = this.showSun ? this.params.sun : undefined
    const props = await this.props

    if (resizeCanvasToDisplaySize(canvas)) {
      // gl.viewport(0, 0, canvas.width, canvas.height);
      const [wid, hei] = [2 * canvas.height, canvas.height]
      gl.viewport((canvas.width - wid) / 2, (canvas.height - hei) / 2, wid, hei)
    }
    const width = 5 / canvas.height

    gl.clearColor(0.0, 0.0, 0.0, 1.0) // Clear to black, fully opaque
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.useProgram(props.mapShader)
    const vertexPosition = gl.getAttribLocation(props.mapShader, 'aVertexPosition')
    gl.bindBuffer(gl.ARRAY_BUFFER, props.mapBuffer)
    gl.enableVertexAttribArray(vertexPosition)
    gl.vertexAttribPointer(vertexPosition, 2, gl.FLOAT, false, 0, 0)
    if (sun) gl.uniform2fv(gl.getUniformLocation(props.mapShader, 'uSun'), sun)
    gl.uniform1f(gl.getUniformLocation(props.mapShader, 'uRotate'), rotate)
    gl.uniform1i(gl.getUniformLocation(props.mapShader, 'uBlend'), this.blend ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.useProgram(props.lineShader)
    const vertexPosition2 = gl.getAttribLocation(props.lineShader, 'aVertexPosition')
    gl.bindBuffer(gl.ARRAY_BUFFER, props.lineBuffer)
    const src2 = vsub(src, [2 * Math.PI * rotate, 0])
    const dst2 = vsub(dst, [2 * Math.PI * rotate, 0])
    const linePoints = createLine(verticesFromCoords(geodesic(src2, dst2, 0.05)), width / 2)
    gl.bufferData(gl.ARRAY_BUFFER, linePoints, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(vertexPosition2)
    gl.vertexAttribPointer(vertexPosition2, 2, gl.FLOAT, false, 0, 0)
    gl.uniform4fv(gl.getUniformLocation(props.lineShader, 'uColor'), [1, 1, 1, 0.5])
    for (const offset of [-2, 0, 2]) {
      gl.uniformMatrix4fv(gl.getUniformLocation(props.lineShader, 'uView'), false, makeMat([offset, 0], 1))
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, linePoints.length / 2)
    }

    gl.useProgram(props.lineShader)
    const vertexPosition3 = gl.getAttribLocation(props.lineShader, 'aVertexPosition')
    gl.bindBuffer(gl.ARRAY_BUFFER, props.lineBuffer)
    const src3 = vsub(src, [2 * Math.PI * rotate, 0])
    const dst3 = vsub(loc, [2 * Math.PI * rotate, 0])
    const linePoints3 = createLine(verticesFromCoords(geodesic(src3, dst3, 0.05)), width)
    gl.bufferData(gl.ARRAY_BUFFER, linePoints3, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(vertexPosition3)
    gl.vertexAttribPointer(vertexPosition3, 2, gl.FLOAT, false, 0, 0)
    gl.uniform4fv(gl.getUniformLocation(props.lineShader, 'uColor'), [0, 1, 1, 1])
    for (const offset of [-2, 0, 2]) {
      gl.uniformMatrix4fv(gl.getUniformLocation(props.lineShader, 'uView'), false, makeMat([offset, 0], 1))
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, linePoints3.length / 2)
    }

    if (sun) {
      gl.bindBuffer(gl.ARRAY_BUFFER, props.sunBuffer)
      gl.enableVertexAttribArray(vertexPosition2)
      gl.vertexAttribPointer(vertexPosition2, 2, gl.FLOAT, false, 0, 0)
      gl.uniform4fv(gl.getUniformLocation(props.lineShader, 'uColor'), [1, 1, 0.5, 1])
      for (const offset of [-2, 0, 2]) {
        gl.uniformMatrix4fv(
          gl.getUniformLocation(props.lineShader, 'uView'),
          false,
          makeMat([offset + (sun[0] - 2 * Math.PI * rotate) / Math.PI, sun[1] / Math.PI], 0.02),
        )
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 50)
      }
    }
  }
}

function initShader(gl: WebGL, shader: ShaderSource): WebGLProgram {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, shader.vertex)
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, shader.fragment)

  // Create the shader program
  const shaderProgram = gl.createProgram()
  if (!shaderProgram) {
    throw Error('Unable to create shader program')
  }

  // Attach the vertex and fragment shaders to the program
  if (vertexShader) gl.attachShader(shaderProgram, vertexShader)
  if (fragmentShader) gl.attachShader(shaderProgram, fragmentShader)

  // Link the program
  gl.linkProgram(shaderProgram)

  // Check if program linking was successful
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    throw Error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram))
  }

  return shaderProgram
}

function loadShader(gl: WebGL, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) {
    console.error('Unable to create shader')
    return null
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  // Check if shader compilation was successful
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }

  return shader
}

async function loadTexture(gl: WebGL, url: string): Promise<WebGLTexture> {
  return new Promise((res) => {
    const texture = gl.createTexture()
    if (!texture) throw Error('Cannot create texture')
    gl.bindTexture(gl.TEXTURE_2D, texture)

    const level = 0
    const internalFormat = gl.RGBA
    const srcFormat = gl.RGBA
    const srcType = gl.UNSIGNED_BYTE

    const image = new Image()
    image.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      res(texture)
    }
    image.src = url
  })
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement): boolean {
  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth * dpr
  const height = canvas.clientHeight * dpr
  const needResize = canvas.width !== width || canvas.height !== height

  if (needResize) {
    canvas.width = 2 * width
    canvas.height = 2 * height
  }

  return needResize
}
