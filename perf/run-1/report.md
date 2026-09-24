# WebGL budget probe — http://127.0.0.1:8080/index.html?auto=1&q=low&fastcard=1

Chrome ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) · viewport 1280x800 @ DPR 1 · context webgl2 {"alpha":true,"depth":true,"stencil":false,"antialias":false,"premultipliedAlpha":true,"preserveDrawingBuffer":false,"powerPreference":"high-performance","failIfMajorPerformanceCaveat":false}
GPU time column is from EXT_disjoint_timer_query_webgl2

Load: 12165ms to first phase · heap after load 26MB · DOM nodes 803

| phase | fps | JS ms p50/p95/max | timer ms/s | draws | tris | upload KB | sync q | loc lookups | uniforms | prog sw | passes | Mpx/frame | DOM mut/s | layouts/s | audio nodes/s | heap MB | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| menu | 1 | 12.3/72.0/72 | 0 | 443 | 199117 | 76 | 0.3 | 0.8 | 1729 | 72.0 | 13.7 | 1.07 | 2 | 2.0 | 0 | 26→23 | 7 |
| intro-drive | 2 | 10.0/17.3/17 | 0 | 479 | 277450 | 76 | 0.0 | 0.0 | 1897 | 84.0 | 12.0 | 1.07 | 5 | 1.5 | 0 | 14→15 | 4 |
| lot | 2 | 11.5/16.6/17 | 0 | 596 | 521227 | 76 | 0.0 | 0.0 | 1957 | 91.0 | 12.0 | 1.07 | 7 | 1.6 | 0 | 17→16 | 5 |
| corridor | 1 | 7.3/10.6/11 | 0 | 270 | 169397 | 76 | 0.0 | 0.0 | 1086 | 51.0 | 12.0 | 1.07 | 7 | 1.4 | 0 | 19→19 | 4 |
| heavy | 2 | 7.3/11.5/12 | 0 | 160 | 491083 | 83 | 0.0 | 0.0 | 866 | 56.8 | 12.0 | 1.07 | 13 | 2.1 | 4 | 16→20 | 5 |
| heavy-medium | 1 | 7.3/1592.4/1592 | 0 | 163 | 493866 | 80 | 0.9 | 2.3 | 930 | 58.0 | 15.0 | 2.49 | 8 | 1.2 | 2 | 24→21 | 8 |
| heavy-high | 1 | 6.7/1872.2/1872 | 0 | 164 | 493840 | 76 | 0.9 | 2.3 | 949 | 57.1 | 17.0 | 3.30 | 7 | 1.2 | 2 | 26→22 | 8 |
| scaler | 2 | 8.1/12.2/12 | 0 | 162 | 526830 | 87 | 0.0 | 0.0 | 894 | 57.4 | 12.0 | 1.07 | 10 | 1.5 | 5 | 19→20 | 5 |
| menu-return | 2 | 7.4/11.9/12 | 0 | 438 | 209891 | 76 | 0.0 | 0.0 | 1725 | 75.0 | 12.0 | 1.07 | 3 | 2.3 | 0 | 20→20 | 4 |

## menu (6s, 12 frames)
- viewports per frame: {"512x512":12,"768x396":24,"384x198":24,"192x99":24,"96x49":24,"48x24":12,"1x1":12} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 3 · node types {}
- state: 74 state changes, 350 bindTexture, 20 vertexAttribPointer, 12.0 clears per frame · bufferData 429 · fbo +9/-0 · tex +28/-0 · shader compiles 2
- uploads: buffers 76 KB/frame · texture data 0 KB/frame · render targets allocated this phase 1.9 MB
- fetch: 0 network, 0 data-URI · long tasks 1 (73ms)
- GPU frame time mean 525.8ms p95 1342.4ms
- **flags:**
  - main-thread JS p95 72.0ms/frame > 8
  - draw calls 443/frame > 150
  - synchronous GL queries 0.3/frame ({"getProgramParameter":3}) — each one stalls the GPU command stream
  - getAttribLocation/getUniformLocation 0.8/frame — cache them at link time
  - uniform calls 1729/frame > 120 — batch into UBOs or skip unchanged values
  - program switches 72/frame
  - 1 long tasks (>50ms) totalling 73ms

## intro-drive (8s, 12 frames)
- viewports per frame: {"512x512":12,"768x396":24,"384x198":24,"192x99":24,"96x49":24,"48x24":12,"1x1":12} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 5 · node types {}
- state: 74 state changes, 396 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 76 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 620.6ms p95 632.1ms
- **flags:**
  - main-thread JS p95 17.3ms/frame > 8
  - draw calls 479/frame > 150
  - uniform calls 1897/frame > 120 — batch into UBOs or skip unchanged values
  - program switches 84/frame
- CPU profile: busy 252ms of 8105ms (idle 97%) · GC 4.6% · (program) 46.4%

  | self ms | % busy | function |
  |---|---|---|
  | 117 | 46.4 | `(program) ` |
  | 12 | 4.6 | `(garbage collector) ` |
  | 9 | 3.6 | `uniformMatrix4fv ` |
  | 7 | 2.9 | `Ma game.js:4118` |
  | 7 | 2.9 | `wn game.js:4118` |
  | 7 | 2.7 | `Bv game.js:4220` |
  | 6 | 2.6 | `Zc.renderBufferDirect game.js:4220` |
  | 6 | 2.4 | `s game.js:4220` |
  | 4 | 1.7 | `setValue game.js:4118` |
  | 4 | 1.5 | `f game.js:3823` |
  | 4 | 1.4 | `(anonymous) ` |
  | 3 | 1.4 | `h game.js:4169` |
  | 3 | 1.2 | `upload game.js:4118` |
  | 3 | 1.1 | `a game.js:3823` |
  | 2 | 0.9 | `updateMatrixWorld game.js:1` |
  | 2 | 0.9 | `e game.js:4169` |
  | 2 | 0.9 | `v game.js:4196` |
  | 2 | 0.9 | `d game.js:3823` |
  | 2 | 0.9 | `getRGB game.js:1` |
  | 2 | 0.9 | `Sf game.js:4220` |

## lot (8s, 13 frames)
- viewports per frame: {"512x512":13,"768x396":26,"384x198":26,"192x99":26,"96x49":26,"48x24":13,"1x1":13} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 6 · node types {}
- state: 84 state changes, 398 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 76 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 584.5ms p95 600.1ms
- **flags:**
  - main-thread JS p95 16.6ms/frame > 8
  - draw calls 596/frame > 150
  - triangles 521227/frame > 300000
  - uniform calls 1957/frame > 120 — batch into UBOs or skip unchanged values
  - program switches 91/frame

## corridor (8s, 11 frames)
- viewports per frame: {"512x512":11,"768x396":22,"384x198":22,"192x99":22,"96x49":22,"48x24":11,"1x1":11} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 5 · node types {}
- state: 77 state changes, 231 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 76 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 696.7ms p95 736.5ms
- **flags:**
  - main-thread JS p95 10.6ms/frame > 8
  - draw calls 270/frame > 150
  - uniform calls 1086/frame > 120 — batch into UBOs or skip unchanged values
  - program switches 51/frame

## heavy (12s, 25 frames)
- viewports per frame: {"512x512":25,"768x396":50,"384x198":50,"192x99":50,"96x49":50,"48x24":25,"1x1":25} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 1.4/s · active 6 · node types {"createBufferSource":17,"createGain":17,"createPanner":10}
- state: 69 state changes, 205 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 8 · fbo +0/-0 · tex +1/-0 · shader compiles 0
- uploads: buffers 83 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 453.7ms p95 473.3ms
- **flags:**
  - main-thread JS p95 11.5ms/frame > 8
  - draw calls 160/frame > 150
  - triangles 491083/frame > 300000
  - uniform calls 866/frame > 120 — batch into UBOs or skip unchanged values
  - program switches 57/frame
- CPU profile: busy 279ms of 12054ms (idle 98%) · GC 1.1% · (program) 32.6%

  | self ms | % busy | function |
  |---|---|---|
  | 91 | 32.6 | `(program) ` |
  | 21 | 7.5 | `toArray game.js:1` |
  | 14 | 5.1 | `updateMatrixWorld game.js:1` |
  | 9 | 3.1 | `multiplyMatrices game.js:1` |
  | 6 | 2.1 | `setValue game.js:4118` |
  | 5 | 1.8 | `(anonymous) ` |
  | 5 | 1.7 | `update game.js:4729` |
  | 5 | 1.7 | `SS game.js:4118` |
  | 5 | 1.6 | `proto.<computed> ` |
  | 4 | 1.6 | `bindVertexArray ` |
  | 4 | 1.5 | `d game.js:3823` |
  | 4 | 1.5 | `oE game.js:4169` |
  | 4 | 1.4 | `tryFire game.js:4642` |
  | 4 | 1.4 | `query2D game.js:4457` |
  | 4 | 1.3 | `Kw game.js:4118` |
  | 3 | 1.1 | `skipHint game.js:4457` |
  | 3 | 1.1 | `s game.js:4220` |
  | 3 | 1.1 | `(garbage collector) ` |
  | 3 | 1.1 | `qw game.js:4118` |
  | 3 | 1.1 | `Sf game.js:4220` |

## heavy-medium (6s, 7 frames)
- viewports per frame: {"1024x1024":7,"1024x528":14,"512x264":14,"256x132":14,"128x66":14,"64x33":14,"32x16":7,"1x1":7} · canvas 1024x528 (css 1280x660)
- textures: 11.0MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 1024x528, 1024x1024, 1024x528, 512x264, 256x132, 128x66, 64x33, 32x16, 64x33, 128x66, 256x132, 512x264]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.8/s · active 5 · node types {"createBufferSource":5,"createGain":5,"createPanner":4}
- state: 83 state changes, 211 bindTexture, 8 vertexAttribPointer, 15.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 4
- uploads: buffers 80 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 1 (1593ms)
- GPU frame time mean 2558.2ms p95 4244.2ms
- **flags:**
  - main-thread JS p95 1592.4ms/frame > 8
  - draw calls 163/frame > 150
  - triangles 493866/frame > 300000
  - synchronous GL queries 0.9/frame ({"getProgramParameter":6}) — each one stalls the GPU command stream
  - getAttribLocation/getUniformLocation 2.3/frame — cache them at link time
  - uniform calls 930/frame > 120 — batch into UBOs or skip unchanged values
  - program switches 58/frame
  - 1 long tasks (>50ms) totalling 1593ms

## heavy-high (6s, 7 frames)
- viewports per frame: {"1024x1024":7,"1280x660":14,"640x330":14,"320x165":14,"160x82":14,"80x41":14,"40x20":14,"20x10":7,"1x1":7} · canvas 1280x660 (css 1280x660)
- textures: 14.1MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 1024x1024, 1280x660, 1280x660, 640x330, 320x165, 160x82, 80x41, 40x20, 20x10, 40x20, 80x41, 160x82, 320x165, 640x330]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.8/s · active 5 · node types {"createBufferSource":5,"createGain":5,"createPanner":4}
- state: 93 state changes, 212 bindTexture, 8 vertexAttribPointer, 17.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 4
- uploads: buffers 76 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 1 (1873ms)
- GPU frame time mean 3025.6ms p95 4637.4ms
- **flags:**
  - main-thread JS p95 1872.2ms/frame > 8
  - draw calls 164/frame > 150
  - triangles 493840/frame > 300000
  - synchronous GL queries 0.9/frame ({"getProgramParameter":6}) — each one stalls the GPU command stream
  - getAttribLocation/getUniformLocation 2.3/frame — cache them at link time
  - uniform calls 949/frame > 120 — batch into UBOs or skip unchanged values
  - program switches 57/frame
  - 1 long tasks (>50ms) totalling 1873ms

## scaler (12s, 18 frames)
- viewports per frame: {"512x512":18,"768x396":36,"384x198":36,"192x99":36,"96x49":36,"48x24":18,"1x1":18} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 512x512, 768x396, 384x198, 192x99, 96x49, 48x24, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 1.8/s · active 5 · node types {"createBufferSource":21,"createGain":21,"createPanner":16}
- state: 69 state changes, 210 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 8 · fbo +0/-0 · tex +1/-0 · shader compiles 0
- uploads: buffers 87 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 663.4ms p95 714.5ms
- **flags:**
  - main-thread JS p95 12.2ms/frame > 8
  - draw calls 162/frame > 150
  - triangles 526830/frame > 300000
  - uniform calls 894/frame > 120 — batch into UBOs or skip unchanged values
  - program switches 57/frame

## menu-return (6s, 14 frames)
- viewports per frame: {"512x512":14,"768x396":28,"384x198":28,"192x99":28,"96x49":28,"48x24":14,"1x1":14} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 512x512, 768x396, 384x198, 192x99, 96x49, 48x24, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 3 · node types {}
- state: 78 state changes, 352 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 76 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 412.1ms p95 462.2ms
- **flags:**
  - main-thread JS p95 11.9ms/frame > 8
  - draw calls 438/frame > 150
  - uniform calls 1725/frame > 120 — batch into UBOs or skip unchanged values
  - program switches 75/frame