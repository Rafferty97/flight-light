precision mediump float;
varying vec2 vTextureCoord;
uniform vec2 uSun;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uStroke;
uniform bool uBlend;

const float PI = 3.1415926535897932384626433832795;
const float DEG = 0.01745329251;

float hav(float theta) {
    return 0.5 * (1.0 - cos(theta));
}

float calcAngle(vec2 coord1, vec2 coord2) {
    float lat1 = coord1.y;
    float lon1 = coord1.x;
    float lat2 = coord2.y;
    float lon2 = coord2.x;

    float havTheta = hav(lat1 - lat2) + cos(lat1) * cos(lat2) * hav(lon1 - lon2);
    return 2.0 * asin(sqrt(clamp(havTheta, 0.0, 1.0)));
}

bool testPoints(vec2 a, vec2 b, float d) {
    float x = acos(cos(a.x - b.x));
    float y = acos(cos(a.y - b.y));
    return (x * x + y * y) < d * d;
}

void main() {
    vec4 dayTex = texture2D(uDay, vTextureCoord);
    vec4 nightTex = texture2D(uNight, vTextureCoord);
    vec4 strokeTex = texture2D(uStroke, vTextureCoord);

    vec4 day = dayTex + 0.5 * strokeTex + 0.1;
    vec4 night = 0.15 * dayTex + nightTex + strokeTex - 0.1;

    vec2 coord = (vTextureCoord - vec2(0.5, 0.5)) * vec2(2.0 * PI, -PI);
    vec2 sun = uSun;

    float angle = (180.0 / PI) * calcAngle(coord, uSun);

    if (uBlend) {
        float alpha = clamp((angle - 90.0) / 18.0, 0.0, 1.0);
        gl_FragColor = alpha * night + (1.0 - alpha) * day;
    } else {
        float alpha = clamp(0.25 * ceil((angle - 90.0) / 6.0), 0.0, 1.0);
        gl_FragColor = alpha * night + (1.0 - alpha) * day;
    }

    if (testPoints(coord, uSun, 0.05)) {
        gl_FragColor += vec4(1.0, 0.9, 0.5, 0.0);
    }
}