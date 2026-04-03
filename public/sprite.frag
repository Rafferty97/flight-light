precision mediump float;
uniform vec4 uColor;
varying vec2 vTextureCoord;
uniform sampler2D uTex;

void main() {
    gl_FragColor = texture2D(uTex, vTextureCoord);
}
