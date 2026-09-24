# WebGL budget probe — http://127.0.0.1:8080/index.html?auto=1&q=low&fastcard=1

Chrome ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) · viewport 1280x800 @ DPR 1 · context webgl2 {"alpha":true,"depth":true,"stencil":false,"antialias":false,"premultipliedAlpha":true,"preserveDrawingBuffer":false,"powerPreference":"high-performance","failIfMajorPerformanceCaveat":false}
GPU time column is from EXT_disjoint_timer_query_webgl2

Load: 15164ms to first phase · heap after load 21MB · DOM nodes 805

| phase | fps | JS ms p50/p95/max | timer ms/s | draws | tris | upload KB | sync q | loc lookups | uniforms | prog sw | passes | Mpx/frame | DOM mut/s | layouts/s | audio nodes/s | heap MB | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| menu | 3 | 6.6/10.2/10 | 0 | 251 | 120575 | 19 | 0.0 | 0.0 | 1216 | 58.0 | 12.0 | 1.07 | 0 | 0.0 | 0 | 21→17 | 4 |
| intro-drive | 2 | 7.7/24.8/25 | 0 | 243 | 138340 | 19 | 0.0 | 0.0 | 1254 | 59.0 | 12.0 | 1.07 | 0 | 0.0 | 0 | 14→15 | 4 |
| lot | 2 | 9.8/16.7/17 | 0 | 329 | 228152 | 19 | 0.0 | 0.0 | 1498 | 77.0 | 12.0 | 1.07 | 1 | 0.1 | 0 | 16→17 | 4 |
| corridor | 1 | 6.0/8.3/8 | 0 | 163 | 126342 | 19 | 0.0 | 0.0 | 826 | 44.0 | 12.0 | 1.07 | 0 | 0.1 | 0 | 18→17 | 3 |
| heavy | 2 | 6.8/11.3/12 | 0 | 117 | 287420 | 25 | 0.0 | 0.0 | 744 | 52.0 | 12.0 | 1.07 | 3 | 0.9 | 5 | 20→19 | 2 |
| heavy-halfscale | 3 | 6.7/8.8/9 | 0 | 117 | 399443 | 30 | 0.0 | 0.0 | 741 | 51.6 | 12.0 | 0.46 | 6 | 1.5 | 9 | 20→21 | 3 |
| heavy-medium | 1 | 7.1/1284.2/1284 | 0 | 122 | 432674 | 22 | 0.8 | 1.6 | 808 | 54.0 | 15.0 | 1.86 | 3 | 0.5 | 5 | 21→18 | 6 |
| heavy-high | 1 | 6.7/1216.5/1217 | 0 | 124 | 455989 | 37 | 0.8 | 1.6 | 822 | 54.5 | 17.0 | 1.86 | 2 | 0.3 | 3 | 17→19 | 6 |
| scaler | 1 | 9.4/12.7/13 | 0 | 122 | 473287 | 34 | 0.0 | 0.0 | 791 | 53.6 | 13.3 | 1.07 | 2 | 0.6 | 4 | 18→18 | 3 |
| menu-return | 3 | 5.6/8.9/9 | 0 | 244 | 118081 | 19 | 0.0 | 0.0 | 1212 | 59.0 | 12.0 | 1.07 | 0 | 0.2 | 0 | 19→18 | 4 |

## menu (6s, 15 frames)
- viewports per frame: {"512x512":15,"768x396":30,"384x198":30,"192x99":30,"96x49":30,"48x24":15,"1x1":15} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 3 · node types {}
- state: 72 state changes, 295 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 19 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 356.8ms p95 382.4ms
- **flags:**
  - main-thread JS p95 10.2ms/frame > 8
  - draw calls 251/frame > 150
  - uniform calls 1216/frame > 1100 — batch into UBOs or skip unchanged values
  - program switches 58/frame

## intro-drive (8s, 13 frames)
- viewports per frame: {"512x512":13,"768x396":26,"384x198":26,"192x99":26,"96x49":26,"48x24":13,"1x1":13} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 5 · node types {}
- state: 72 state changes, 300 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 19 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 574.5ms p95 583.6ms
- **flags:**
  - main-thread JS p95 24.8ms/frame > 8
  - draw calls 243/frame > 150
  - uniform calls 1254/frame > 1100 — batch into UBOs or skip unchanged values
  - program switches 59/frame
- CPU profile: busy 211ms of 8078ms (idle 97%) · GC 2.7% · (program) 42.2%

  | self ms | % busy | function |
  |---|---|---|
  | 89 | 42.2 | `(program) ` |
  | 12 | 5.6 | `o1 game.js:4220` |
  | 6 | 2.8 | `ES game.js:4118` |
  | 6 | 2.7 | `uniformMatrix4fv ` |
  | 6 | 2.7 | `(garbage collector) ` |
  | 5 | 2.6 | `renderBufferDirect game.js:4220` |
  | 5 | 2.6 | `setValue game.js:4118` |
  | 5 | 2.6 | `kf game.js:4220` |
  | 5 | 2.5 | `a game.js:3823` |
  | 4 | 2.0 | `ot game.js:4196` |
  | 4 | 2.0 | `(anonymous) ` |
  | 4 | 1.9 | `dS game.js:4118` |
  | 4 | 1.8 | `texSubImage2D ` |
  | 3 | 1.6 | `a1 game.js:4220` |
  | 3 | 1.4 | `uniform1f ` |
  | 3 | 1.3 | `updateMatrixWorld game.js:1` |
  | 2 | 1.2 | `v game.js:4196` |
  | 2 | 1.1 | `hS game.js:4118` |
  | 2 | 1.1 | `bindVertexArray ` |
  | 2 | 1.0 | `normalize game.js:1` |

## lot (8s, 15 frames)
- viewports per frame: {"512x512":15,"768x396":30,"384x198":30,"192x99":30,"96x49":30,"48x24":15,"1x1":15} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 6 · node types {}
- state: 76 state changes, 352 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 19 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 497.5ms p95 536.5ms
- **flags:**
  - main-thread JS p95 16.7ms/frame > 8
  - draw calls 329/frame > 150
  - uniform calls 1498/frame > 1100 — batch into UBOs or skip unchanged values
  - program switches 77/frame

## corridor (8s, 12 frames)
- viewports per frame: {"512x512":12,"768x396":24,"384x198":24,"192x99":24,"96x49":24,"48x24":12,"1x1":12} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 5 · node types {}
- state: 76 state changes, 201 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 19 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 662.8ms p95 694.8ms
- **flags:**
  - main-thread JS p95 8.3ms/frame > 8
  - draw calls 163/frame > 150
  - program switches 44/frame

## heavy (12s, 29 frames)
- viewports per frame: {"512x512":29,"768x396":58,"384x198":58,"192x99":58,"96x49":58,"48x24":29,"1x1":29} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 1.8/s · active 6 · node types {"createBufferSource":21,"createGain":21,"createPanner":13}
- state: 69 state changes, 194 bindTexture, 1 vertexAttribPointer, 12.0 clears per frame · bufferData 14 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 25 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 402.2ms p95 434.2ms
- **flags:**
  - main-thread JS p95 11.3ms/frame > 8
  - program switches 52/frame
- CPU profile: busy 301ms of 12056ms (idle 98%) · GC 1.1% · (program) 30.8%

  | self ms | % busy | function |
  |---|---|---|
  | 93 | 30.8 | `(program) ` |
  | 20 | 6.7 | `toArray game.js:1` |
  | 11 | 3.6 | `(anonymous) ` |
  | 10 | 3.3 | `updateMatrixWorld game.js:1` |
  | 10 | 3.2 | `multiplyMatrices game.js:1` |
  | 8 | 2.8 | `setValue game.js:4118` |
  | 8 | 2.7 | `kf game.js:4220` |
  | 7 | 2.4 | `update game.js:4737` |
  | 7 | 2.3 | `o game.js:5` |
  | 7 | 2.2 | `upload game.js:4118` |
  | 7 | 2.2 | `Z game.js:4196` |
  | 7 | 2.2 | `v game.js:4196` |
  | 6 | 2.1 | `o1 game.js:4220` |
  | 5 | 1.7 | `divideScalar game.js:1` |
  | 5 | 1.6 | `bindVertexArray ` |
  | 4 | 1.4 | `texSubImage2D ` |
  | 3 | 1.2 | `renderBufferDirect game.js:4220` |
  | 3 | 1.1 | `(garbage collector) ` |
  | 3 | 1.1 | `_rayCandidates game.js:4465` |
  | 3 | 1.0 | `proto.<computed> ` |

## heavy-halfscale (6s, 21 frames)
- viewports per frame: {"512x512":21,"384x198":42,"192x99":42,"96x49":42,"48x24":42,"24x12":21,"1x1":21} · canvas 384x198 (css 1280x660)
- textures: 3.0MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 1x1, 384x198, 192x99, 96x49, 48x24, 24x12, 48x24, 96x49, 192x99]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 3.3/s · active 8 · node types {"createBufferSource":20,"createGain":20,"createPanner":14}
- state: 69 state changes, 192 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 30 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 275.7ms p95 292.4ms
- **flags:**
  - main-thread JS p95 8.8ms/frame > 8
  - triangles 399443/frame > 300000
  - program switches 52/frame

## heavy-medium (6s, 8 frames)
- viewports per frame: {"1024x1024":8,"768x396":16,"384x198":16,"192x99":16,"96x49":16,"48x24":16,"24x12":8,"1x1":8} · canvas 768x396 (css 1280x660)
- textures: 8.6MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 768x396, 1024x1024, 768x396, 384x198, 192x99, 96x49, 48x24, 24x12, 48x24, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 2.0/s · active 6 · node types {"createBufferSource":12,"createGain":12,"createPanner":7}
- state: 83 state changes, 202 bindTexture, 4 vertexAttribPointer, 15.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +1/-0 · shader compiles 4
- uploads: buffers 22 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 2 (4236ms)
- GPU frame time mean 807.4ms p95 897.5ms
- **flags:**
  - main-thread JS p95 1284.2ms/frame > 8
  - triangles 432674/frame > 300000
  - synchronous GL queries 0.8/frame ({"getProgramParameter":6}) — each one stalls the GPU command stream
  - getAttribLocation/getUniformLocation 1.6/frame — cache them at link time
  - program switches 54/frame
  - 2 long tasks (>50ms) totalling 4236ms

## heavy-high (6s, 8 frames)
- viewports per frame: {"1024x1024":8,"768x396":16,"384x198":16,"192x99":16,"96x49":16,"48x24":16,"24x12":16,"12x6":8,"1x1":8} · canvas 768x396 (css 1280x660)
- textures: 8.6MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 1024x1024, 768x396, 768x396, 384x198, 192x99, 96x49, 48x24, 24x12, 12x6, 24x12, 48x24, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 1.0/s · active 5 · node types {"createBufferSource":6,"createGain":6,"createPanner":4}
- state: 93 state changes, 208 bindTexture, 3 vertexAttribPointer, 17.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 4
- uploads: buffers 37 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 2 (5302ms)
- GPU frame time mean 899.0ms p95 1159.4ms
- **flags:**
  - main-thread JS p95 1216.5ms/frame > 8
  - triangles 455989/frame > 300000
  - synchronous GL queries 0.8/frame ({"getProgramParameter":6}) — each one stalls the GPU command stream
  - getAttribLocation/getUniformLocation 1.6/frame — cache them at link time
  - program switches 55/frame
  - 2 long tasks (>50ms) totalling 5302ms

## scaler (12s, 17 frames)
- viewports per frame: {"512x512":17,"768x396":34,"384x198":34,"192x99":34,"96x49":34,"48x24":17,"1x1":17} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 768x396, 512x512, 384x198, 192x99, 96x49, 48x24, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 1.4/s · active 6 · node types {"createBufferSource":17,"createGain":17,"createPanner":12}
- state: 69 state changes, 205 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +9/-0 · tex +12/-0 · shader compiles 0
- uploads: buffers 34 KB/frame · texture data 0 KB/frame · render targets allocated this phase 2.9 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 685.6ms p95 764.1ms
- **flags:**
  - main-thread JS p95 12.7ms/frame > 8
  - triangles 473287/frame > 300000
  - program switches 54/frame

## menu-return (6s, 15 frames)
- viewports per frame: {"512x512":15,"768x396":30,"384x198":30,"192x99":30,"96x49":30,"48x24":15,"1x1":15} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 512x512, 768x396, 384x198, 192x99, 96x49, 48x24, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 3 · node types {}
- state: 74 state changes, 296 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 19 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 349.0ms p95 358.2ms
- **flags:**
  - main-thread JS p95 8.9ms/frame > 8
  - draw calls 244/frame > 150
  - uniform calls 1212/frame > 1100 — batch into UBOs or skip unchanged values
  - program switches 59/frame