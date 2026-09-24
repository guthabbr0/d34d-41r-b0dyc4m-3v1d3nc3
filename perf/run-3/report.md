# WebGL budget probe — http://127.0.0.1:8080/index.html?auto=1&q=low&fastcard=1

Chrome ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) · viewport 1280x800 @ DPR 1 · context webgl2 {"alpha":true,"depth":true,"stencil":false,"antialias":false,"premultipliedAlpha":true,"preserveDrawingBuffer":false,"powerPreference":"high-performance","failIfMajorPerformanceCaveat":false}
GPU time column is from EXT_disjoint_timer_query_webgl2

Load: 14943ms to first phase · heap after load 13MB · DOM nodes 875

| phase | fps | JS ms p50/p95/max | timer ms/s | draws | tris | upload KB | sync q | loc lookups | uniforms | prog sw | passes | Mpx/frame | DOM mut/s | layouts/s | audio nodes/s | heap MB | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| menu | 3 | 5.8/12.6/13 | 0 | 251 | 120575 | 19 | 0.0 | 0.0 | 1220 | 58.0 | 12.0 | 1.07 | 0 | 0.2 | 0 | 13→21 | 4 |
| intro-drive | 2 | 9.5/12.6/13 | 0 | 243 | 138350 | 19 | 0.0 | 0.0 | 1254 | 59.0 | 12.0 | 1.07 | 0 | 0.1 | 0 | 14→14 | 4 |
| lot | 2 | 9.0/15.2/15 | 0 | 325 | 223042 | 19 | 0.0 | 0.0 | 1498 | 77.1 | 12.0 | 1.07 | 1 | 0.1 | 0 | 16→16 | 4 |
| corridor | 1 | 6.8/17.3/17 | 0 | 163 | 126612 | 19 | 0.0 | 0.0 | 825 | 44.0 | 12.0 | 1.07 | 0 | 0.1 | 0 | 18→17 | 3 |
| heavy | 2 | 6.5/10.0/14 | 0 | 118 | 286423 | 27 | 0.0 | 0.0 | 744 | 52.0 | 12.0 | 1.07 | 3 | 0.9 | 5 | 19→19 | 2 |
| heavy-halfscale | 3 | 6.4/11.2/11 | 0 | 117 | 411633 | 24 | 0.0 | 0.0 | 741 | 52.1 | 12.0 | 0.46 | 6 | 1.5 | 9 | 18→19 | 3 |
| heavy-medium | 1 | 7.4/1358.4/1358 | 0 | 122 | 443372 | 22 | 0.6 | 1.3 | 808 | 54.0 | 15.0 | 1.86 | 3 | 0.7 | 5 | 21→16 | 6 |
| heavy-high | 1 | 7.2/1533.0/1533 | 0 | 127 | 466246 | 26 | 0.8 | 1.6 | 850 | 55.0 | 17.0 | 1.86 | 2 | 0.3 | 3 | 18→19 | 6 |
| scaler | 2 | 8.7/11.9/12 | 0 | 123 | 478176 | 29 | 0.0 | 0.0 | 797 | 53.4 | 13.2 | 1.07 | 3 | 0.5 | 6 | 18→18 | 3 |
| menu-return | 3 | 5.6/8.1/8 | 0 | 244 | 118081 | 19 | 0.0 | 0.0 | 1215 | 59.0 | 12.0 | 1.07 | 0 | 0.2 | 0 | 18→18 | 4 |

## menu (6s, 16 frames)
- viewports per frame: {"512x512":16,"768x396":32,"384x198":32,"192x99":32,"96x49":32,"48x24":16,"1x1":16} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 3 · node types {}
- state: 72 state changes, 295 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 19 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 354.4ms p95 377.1ms
- **flags:**
  - main-thread JS p95 12.6ms/frame > 8
  - draw calls 251/frame > 150
  - uniform calls 1220/frame > 1100 — batch into UBOs or skip unchanged values
  - program switches 58/frame

## intro-drive (8s, 13 frames)
- viewports per frame: {"512x512":13,"768x396":26,"384x198":26,"192x99":26,"96x49":26,"48x24":13,"1x1":13} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 5 · node types {}
- state: 72 state changes, 300 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 19 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 569.7ms p95 595.4ms
- **flags:**
  - main-thread JS p95 12.6ms/frame > 8
  - draw calls 243/frame > 150
  - uniform calls 1254/frame > 1100 — batch into UBOs or skip unchanged values
  - program switches 59/frame
- CPU profile: busy 224ms of 8079ms (idle 97%) · GC 3.6% · (program) 43.0%

  | self ms | % busy | function |
  |---|---|---|
  | 97 | 43.0 | `(program) ` |
  | 12 | 5.4 | `a1 game.js:4220` |
  | 9 | 4.0 | `FS game.js:4118` |
  | 8 | 3.6 | `(garbage collector) ` |
  | 8 | 3.5 | `renderBufferDirect game.js:4220` |
  | 8 | 3.4 | `s game.js:4220` |
  | 8 | 3.4 | `activeTexture ` |
  | 7 | 3.1 | `setValue game.js:4118` |
  | 6 | 2.5 | `(anonymous) ` |
  | 4 | 1.7 | `kf game.js:4220` |
  | 4 | 1.6 | `texSubImage2D ` |
  | 3 | 1.5 | `updateMatrixWorld game.js:1` |
  | 3 | 1.4 | `uniform3f ` |
  | 3 | 1.3 | `drawElements ` |
  | 3 | 1.2 | `upload game.js:4118` |
  | 2 | 1.0 | `bindTexture ` |
  | 2 | 0.8 | `u game.js:3823` |
  | 2 | 0.8 | `multiplyMatrices game.js:1` |
  | 2 | 0.8 | `uniformMatrix4fv ` |
  | 2 | 0.8 | `uS game.js:4118` |

## lot (8s, 14 frames)
- viewports per frame: {"512x512":14,"768x396":28,"384x198":28,"192x99":28,"96x49":28,"48x24":14,"1x1":14} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 6 · node types {}
- state: 76 state changes, 352 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 19 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 512.3ms p95 566.3ms
- **flags:**
  - main-thread JS p95 15.2ms/frame > 8
  - draw calls 325/frame > 150
  - uniform calls 1498/frame > 1100 — batch into UBOs or skip unchanged values
  - program switches 77/frame

## corridor (8s, 11 frames)
- viewports per frame: {"512x512":11,"768x396":22,"384x198":22,"192x99":22,"96x49":22,"48x24":11,"1x1":11} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 5 · node types {}
- state: 76 state changes, 201 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 19 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 704.7ms p95 760.9ms
- **flags:**
  - main-thread JS p95 17.3ms/frame > 8
  - draw calls 163/frame > 150
  - program switches 44/frame

## heavy (12s, 28 frames)
- viewports per frame: {"512x512":28,"768x396":56,"384x198":56,"192x99":56,"96x49":56,"48x24":28,"1x1":28} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 768x396, 384x198, 192x99, 96x49, 48x24, 1x1, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 1.8/s · active 6 · node types {"createBufferSource":22,"createGain":22,"createPanner":14}
- state: 69 state changes, 196 bindTexture, 1 vertexAttribPointer, 12.0 clears per frame · bufferData 14 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 27 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 401.1ms p95 462.6ms
- **flags:**
  - main-thread JS p95 10.0ms/frame > 8
  - program switches 52/frame
- CPU profile: busy 287ms of 12048ms (idle 98%) · GC 2.7% · (program) 32.0%

  | self ms | % busy | function |
  |---|---|---|
  | 92 | 32.0 | `(program) ` |
  | 13 | 4.6 | `uniform3f ` |
  | 12 | 4.1 | `uniformMatrix4fv ` |
  | 10 | 3.4 | `toArray game.js:1` |
  | 8 | 2.9 | `v game.js:4196` |
  | 8 | 2.7 | `(garbage collector) ` |
  | 7 | 2.4 | `kf game.js:4220` |
  | 7 | 2.3 | `upload game.js:4118` |
  | 7 | 2.3 | `updateMatrixWorld game.js:1` |
  | 6 | 2.1 | `s game.js:4220` |
  | 5 | 1.8 | `bufferSubData ` |
  | 5 | 1.8 | `update game.js:4737` |
  | 5 | 1.6 | `texSubImage2D ` |
  | 4 | 1.5 | `seqWithValue game.js:4118` |
  | 4 | 1.4 | `(anonymous) ` |
  | 4 | 1.4 | `a1 game.js:4220` |
  | 4 | 1.3 | `o game.js:4072` |
  | 4 | 1.3 | `bufferData ` |
  | 3 | 1.2 | `uniformMatrix3fv ` |
  | 3 | 1.1 | `requestAnimationFrame ` |

## heavy-halfscale (6s, 20 frames)
- viewports per frame: {"512x512":20,"384x198":40,"192x99":40,"96x49":40,"48x24":40,"24x12":20,"1x1":20} · canvas 384x198 (css 1280x660)
- textures: 3.0MB [1x1, 1x1, 384x512, 384x512, 512x512, 1x1, 1x1, 384x198, 192x99, 96x49, 48x24, 24x12, 48x24, 96x49, 192x99]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 3.2/s · active 9 · node types {"createBufferSource":19,"createGain":19,"createPanner":14}
- state: 69 state changes, 194 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +1/-0 · shader compiles 0
- uploads: buffers 24 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 276.3ms p95 334.5ms
- **flags:**
  - main-thread JS p95 11.2ms/frame > 8
  - triangles 411633/frame > 300000
  - program switches 52/frame

## heavy-medium (6s, 10 frames)
- viewports per frame: {"1024x1024":10,"768x396":20,"384x198":20,"192x99":20,"96x49":20,"48x24":20,"24x12":10,"1x1":10} · canvas 768x396 (css 1280x660)
- textures: 8.6MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 768x396, 1024x1024, 768x396, 384x198, 192x99, 96x49, 48x24, 24x12, 48x24, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 1.8/s · active 6 · node types {"createBufferSource":11,"createGain":11,"createPanner":6}
- state: 83 state changes, 203 bindTexture, 3 vertexAttribPointer, 15.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 4
- uploads: buffers 22 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 2 (4586ms)
- GPU frame time mean 759.8ms p95 906.5ms
- **flags:**
  - main-thread JS p95 1358.4ms/frame > 8
  - triangles 443372/frame > 300000
  - synchronous GL queries 0.6/frame ({"getProgramParameter":6}) — each one stalls the GPU command stream
  - getAttribLocation/getUniformLocation 1.3/frame — cache them at link time
  - program switches 54/frame
  - 2 long tasks (>50ms) totalling 4586ms

## heavy-high (6s, 8 frames)
- viewports per frame: {"1024x1024":8,"768x396":16,"384x198":16,"192x99":16,"96x49":16,"48x24":16,"24x12":16,"12x6":8,"1x1":8} · canvas 768x396 (css 1280x660)
- textures: 8.6MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 1024x1024, 768x396, 768x396, 384x198, 192x99, 96x49, 48x24, 24x12, 12x6, 24x12, 48x24, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 1.0/s · active 5 · node types {"createBufferSource":6,"createGain":6,"createPanner":4}
- state: 93 state changes, 211 bindTexture, 3 vertexAttribPointer, 17.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 4
- uploads: buffers 26 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 2 (5387ms)
- GPU frame time mean 1794.0ms p95 3887.1ms
- **flags:**
  - main-thread JS p95 1533.0ms/frame > 8
  - triangles 466246/frame > 300000
  - synchronous GL queries 0.8/frame ({"getProgramParameter":6}) — each one stalls the GPU command stream
  - getAttribLocation/getUniformLocation 1.6/frame — cache them at link time
  - program switches 55/frame
  - 2 long tasks (>50ms) totalling 5387ms

## scaler (12s, 19 frames)
- viewports per frame: {"512x512":19,"768x396":38,"384x198":38,"192x99":38,"96x49":38,"48x24":19,"1x1":19} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 768x396, 512x512, 384x198, 192x99, 96x49, 48x24, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 2.0/s · active 6 · node types {"createBufferSource":24,"createGain":24,"createPanner":18}
- state: 69 state changes, 206 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +9/-0 · tex +12/-0 · shader compiles 0
- uploads: buffers 29 KB/frame · texture data 0 KB/frame · render targets allocated this phase 2.9 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 621.8ms p95 655.0ms
- **flags:**
  - main-thread JS p95 11.9ms/frame > 8
  - triangles 478176/frame > 300000
  - program switches 53/frame

## menu-return (6s, 15 frames)
- viewports per frame: {"512x512":15,"768x396":30,"384x198":30,"192x99":30,"96x49":30,"48x24":15,"1x1":15} · canvas 768x396 (css 1280x660)
- textures: 4.4MB [1x1, 1x1, 384x512, 384x512, 1x1, 1x1, 512x512, 768x396, 384x198, 192x99, 96x49, 48x24, 96x49, 192x99, 384x198]
- audio: decoded 0.0MB in 0 buffers (0ms) · sources 0.0/s · active 3 · node types {}
- state: 74 state changes, 296 bindTexture, 0 vertexAttribPointer, 12.0 clears per frame · bufferData 0 · fbo +0/-0 · tex +0/-0 · shader compiles 0
- uploads: buffers 19 KB/frame · texture data 0 KB/frame · render targets allocated this phase 0.0 MB
- fetch: 0 network, 0 data-URI · long tasks 0 (0ms)
- GPU frame time mean 351.8ms p95 366.9ms
- **flags:**
  - main-thread JS p95 8.1ms/frame > 8
  - draw calls 244/frame > 150
  - uniform calls 1215/frame > 1100 — batch into UBOs or skip unchanged values
  - program switches 59/frame