precision mediump float;
varying vec2 vTextureCoord;

void main() {
    float radius = length(vTextureCoord);
    float alpha = 0.95 - pow(radius, 6.0);
    float whiteness = 0.75 - (0.25 * radius);
    gl_FragColor = vec4(1.0, 1.0, whiteness, alpha);
}
