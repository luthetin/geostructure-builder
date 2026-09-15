/* ============================================================
   skeleton-check.js —— 多层面骨架编辑器 检验
   ------------------------------------------------------------
   用假 WebGL + 假 DOM 让 skeleton.html 的脚本在 Node 里跑起来，
   对数学与规则做数值断言：

     A 插值性      Catmull-Rom 严格穿过控制点
     B 逼近性      B 样条不穿过控制点，且不超出控制网范围
     C 法线        解析法线 = 有限差分法线
     D 曲率        抛物面高斯曲率 = 解析值 c²
     E 曲率符号    穹隆 K>0 / 鞍部 K<0 / 圆柱(可展) K=0
     F 曲面网格    无 NaN、图幅范围正确
     G 骨架网格    属性缓冲齐全、边数正确、无重复边
     H 绘制模式    线段必须用 LINES（数量对但模式错是抓不到的）
     I 次序规则    逐点验证：透明 ⟺ 存在更高次序层面压在其下
     J 沉积次序    新加层面必须落在所有已有层面之上
     K 层面交线    交叉的成对交线存在且落在真交线上；不交叉则无交线

   运行：node test/skeleton-check.js
   ============================================================ */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const scriptSrc = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlNoScript = html.replace(/<script>[\s\S]*?<\/script>/g, "");

const defaults = {};
for (const tag of htmlNoScript.match(/<input\b[^>]*>/g) || []) {
  const id = (tag.match(/id="([^"]+)"/) || [])[1]; if (!id) continue;
  defaults[id] = { type: (tag.match(/type="([^"]+)"/) || [])[1] || "text",
    value: (tag.match(/value="([^"]*)"/) || [])[1] || "", checked: /\schecked\b/.test(tag) };
}
for (const m of htmlNoScript.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
  const opts = [...m[2].matchAll(/<option\b[^>]*>/g)].map(o => o[0]);
  let val = null;
  for (const o of opts) { const v = (o.match(/value="([^"]*)"/) || [])[1];
    if (/\sselected\b/.test(o)) { val = v; break; } if (val === null) val = v; }
  defaults[m[1]] = { type: "select-one", value: val, checked: false };
}

const GLC = { DEPTH_TEST:1, BLEND:2, SRC_ALPHA:3, ONE_MINUS_SRC_ALPHA:4, ARRAY_BUFFER:5,
  ELEMENT_ARRAY_BUFFER:6, STATIC_DRAW:7, VERTEX_SHADER:8, FRAGMENT_SHADER:9, COMPILE_STATUS:10,
  LINK_STATUS:11, TRIANGLES:12, POINTS:13, UNSIGNED_SHORT:14, FLOAT:15,
  COLOR_BUFFER_BIT:16, DEPTH_BUFFER_BIT:17, LINES:18 };
const draws = [];
let gDT = false, gDM = true;            // 记录深度测试 / 深度写入状态
const fakeGL = new Proxy({
  getShaderParameter: () => true, getProgramParameter: () => true,
  createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
  deleteBuffer: () => {}, getAttribLocation: () => 0, getUniformLocation: () => ({}),
  getShaderInfoLog: () => "", getProgramInfoLog: () => "",
  createImageData: (w, h) => ({ width:w, height:h, data: new Uint8ClampedArray(w*h*4) }),
  getImageData:    (x, y, w, h) => ({ width:w, height:h, data: new Uint8ClampedArray(w*h*4) }),
  measureText:     (t) => ({ width: String(t).length * 6 }),
  enable:  (cap) => { if (cap === GLC.DEPTH_TEST) gDT = true; },
  disable: (cap) => { if (cap === GLC.DEPTH_TEST) gDT = false; },
  depthMask: (v) => { gDM = !!v; },
  drawArrays:   (mode, first, count) => { draws.push({ mode, count, dt:gDT, dm:gDM }); },
  drawElements: (mode, count)        => { draws.push({ mode, count, dt:gDT, dm:gDM }); },
}, { get(t,k){ return k in t ? t[k] : (k in GLC ? GLC[k] : () => {}); },
     set(t,k,v){ t[k]=v; return true; } });

class El {
  constructor(tag, id) {
    this.tagName=String(tag).toUpperCase(); this.id=id||""; this._ls={}; this.style={};
    this.textContent=""; this._html=""; this.value=""; this.checked=false; this.type="text";
    this.name=""; this.children=[]; this.className="";
    this.clientWidth=1000; this.clientHeight=800; this.width=1000; this.height=800;
  }
  addEventListener(t,f){ (this._ls[t]=this._ls[t]||[]).push(f); }
  dispatchEvent(e){ for(const f of this._ls[e.type]||[]) f.call(this,e); return true; }
  appendChild(c){ this.children.push(c); return c; }
  querySelectorAll(){ return []; }
  querySelector(){ return new El("div"); }
  set innerHTML(v){ this._html=v; } get innerHTML(){ return this._html; }
  getContext(){ return fakeGL; }
  getBoundingClientRect(){ return {left:0,top:0,right:1000,bottom:800,width:1000,height:800}; }
}
const reg = {};
const doc = {
  getElementById(id) {
    if (reg[id]) return reg[id];
    const el = new El(id==="gl" ? "canvas" : "input", id);
    const d = defaults[id];
    if (d) { el.type=d.type; el.value=d.value; el.checked=!!d.checked; }
    reg[id] = el; return el;
  },
  createElement(t){ return new El(t); },
  querySelectorAll(){ return []; },
};
class Ev { constructor(t){ this.type=t; } }

const winEl = new El("window");
winEl.devicePixelRatio = 1;
const sandbox = {
  document: doc, window: winEl,
  requestAnimationFrame: ()=>{}, console, Event: Ev,
};
const epilogue = `
globalThis.__api = {
  S, SPACING, NS, SZ, MAT_CR, MAT_BS, evalSurf, mapL, mat,
  mkLayer, addLayer, seedLayer, relaxLayer, resampleAll,
  evalLayer, computeAlpha, buildLayerSurface, buildIntersections,
  stitchContours, emitRibbon, smoothPoly, polysToSegs, sampleSurface,
  buildContours, topLayer, get contourInfo(){ return contourInfo; },
  get contourAnchors(){ return contourAnchors; },
  get mapInterSegs(){ return mapInterSegs; },
  rebuild, render, zRange, sortedLayers,
  camMVP, camEye, project, activeCtrl, pick, worldPerPixel,
  FS_SURF, drawMap,
  get mapState(){ return mapState; },
  snapshot, loadText, selSet,
  get meshSurf(){return meshSurf}, get meshWire(){return meshWire},
  get meshHandles(){return meshHandles}, get meshInter(){return meshInter},
  get meshContour(){return meshContour},
};
`;
try {
  vm.runInNewContext(scriptSrc + epilogue, sandbox, { filename: "index.html<script>" });
} catch (e) {
  console.error("❌ 脚本执行失败：", e.message);
  console.error(e.stack.split("\n").slice(0,6).join("\n"));
  process.exit(1);
}
const api = sandbox.__api;
const { S, SPACING, MAT_CR, MAT_BS, evalSurf, NS, SZ } = api;
console.log("✅ 冒烟：脚本在假 WebGL 下完整执行，初始化与首帧 render() 未抛异常");

let pass=0, fail=0;
const check=(n,ok,d)=>{ ok?pass++:fail++; console.log(`${ok?"✅":"❌"} ${n}${d?"　"+d:""}`); };

/* 重置成一个干净的两层场景 */
function reset(layers) {
  S.layers = []; S.active = 0; S.res = 9;
  S.orderRule = true; S.curv = false; S.surf = 'interp';
  S.showWire = true; S.showFill = false; S.showHandles = true;
  S.xray = true; S.inter = true;
  S.showContour = true; S.contourInt = 100; S.contourLabel = true;
  S.mapMode = 'color'; S.mapContour = true; S.mapInter = true;
  S.dragSens = 0.3;
  api.selSet.clear();
  for (const spec of layers) {
    const L = api.mkLayer(spec.name || "L", spec.order, [150,150,150], 0.5);
    L.z = new Float32Array(S.res * S.res);
    const f = spec.f;
    for (let j=0;j<S.res;j++) for (let i=0;i<S.res;i++)
      L.z[j*S.res+i] = f(i*SPACING, j*SPACING);
    S.layers.push(L);
  }
  api.rebuild(false);
  return S.layers;
}
const M = () => MAT_CR;

/* ============================================================ A0 */
console.log("\n─── A0. 预设场景（必须在任何 reset 之前检查）───");
{
  const n = S.layers.length, L = S.layers[0];
  check("预设只有一个层面", n === 1, `实际 ${n} 个`);
  let flat = true;
  for (let k = 1; k < L.z.length; k++) if (Math.abs(L.z[k] - L.z[0]) > 1e-9) flat = false;
  check("预设层面是平面（所有控制点等高）", flat, `高程 ${L.z[0].toFixed(0)} m`);
}

/* ============================================================ A */
console.log("\n─── A. Catmull-Rom 严格穿过控制点 ───");
{
  const [L] = reset([{ f:(x,y)=>600+300*Math.sin(x/900)+200*Math.cos(y/700) }]);
  let worst = 0, N = S.res;
  for (let j=0;j<N;j++) for (let i=0;i<N;i++)
    worst = Math.max(worst, Math.abs(evalSurf(L, i*SPACING, j*SPACING, M()).z - L.z[j*N+i]));
  check("曲面在控制点处正好等于该点高程", worst < 1e-6, `最大偏差 ${worst.toExponential(2)} m`);
}

/* ============================================================ B */
console.log("\n─── B. B 样条的逼近性 ───");
{
  const [L] = reset([{ f:(x,y)=>600+300*Math.sin(x/900)+200*Math.cos(y/700) }]);
  let maxMiss = 0, N = S.res;
  for (let j=1;j<N-1;j++) for (let i=1;i<N-1;i++)
    maxMiss = Math.max(maxMiss, Math.abs(evalSurf(L, i*SPACING, j*SPACING, MAT_BS).z - L.z[j*N+i]));
  check("B 样条确实不穿过控制点", maxMiss > 5, `最大偏离 ${maxMiss.toFixed(1)} m`);
  let lo=Infinity, hi=-Infinity;
  for (let k=0;k<L.z.length;k++){ lo=Math.min(lo,L.z[k]); hi=Math.max(hi,L.z[k]); }
  let out = 0;
  for (let b=0;b<=60;b++) for (let a=0;a<=60;a++) {
    const z = evalSurf(L, a*api.mapL()/60, b*api.mapL()/60, MAT_BS).z;
    if (z < lo-1e-6 || z > hi+1e-6) out++;
  }
  check("B 样条曲面不超出控制网高程范围", out === 0, out ? `${out} 点越界` : "全部在范围内");
}

/* ============================================================ C */
console.log("\n─── C. 解析法线 = 差分法线 ───");
{
  const [L] = reset([{ f:(x,y)=>600+0.0002*(x*x+y*y)+120*Math.sin(x/700) }]);
  let worst = 0, cnt = 0, h = 2;
  for (let b=8;b<=52;b+=6) for (let a=8;a<=52;a+=6) {
    const x=a*api.mapL()/60, y=b*api.mapL()/60, s=evalSurf(L,x,y,M());
    const fx=(evalSurf(L,x+h,y,M()).z - evalSurf(L,x-h,y,M()).z)/(2*h);
    const fy=(evalSurf(L,x,y+h,M()).z - evalSurf(L,x,y-h,M()).z)/(2*h);
    const g=1/Math.hypot(-fx,-fy,1);
    worst = Math.max(worst, Math.hypot(s.nx-(-fx*g), s.ny-(-fy*g), s.nz-g)); cnt++;
  }
  check("解析法线与差分法线一致", worst < 1e-4, `${cnt} 点，最大差 ${worst.toExponential(2)}`);
}

/* ============================================================ D */
console.log("\n─── D. 抛物面曲率 = 解析值 c² ───");
{
  const c = 4e-4, cx = 2000, cy = 2000;
  const [L] = reset([{ f:(x,y)=>1000 + c/2*((x-cx)**2 + (y-cy)**2) }]);
  const K = evalSurf(L, cx, cy, M()).K, exact = c*c;
  check("K 等于解析值 c²", Math.abs(K-exact)/exact < 0.01,
        `算得 ${K.toExponential(4)}，解析 ${exact.toExponential(4)}，相对误差 ${(Math.abs(K-exact)/exact*100).toFixed(3)}%`);
}

/* ============================================================ E */
console.log("\n─── E. 曲率符号：穹隆 / 鞍部 / 圆柱 ───");
{
  const c = 4e-4, cx = 2000, cy = 2000;
  let [L] = reset([{ f:(x,y)=>1000 - c/2*((x-cx)**2 + (y-cy)**2) }]);
  const Kd = evalSurf(L, cx, cy, M()).K;
  [L] = reset([{ f:(x,y)=>1000 + c/2*((x-cx)**2 - (y-cy)**2) }]);
  const Ks = evalSurf(L, cx, cy, M()).K;
  [L] = reset([{ f:(x,y)=>1000 + c/2*(x-cx)**2 }]);
  const Kc = evalSurf(L, cx, cy, M()).K;
  check("穹隆 K > 0", Kd > 0, `K = ${Kd.toExponential(3)}`);
  check("鞍部 K < 0", Ks < 0, `K = ${Ks.toExponential(3)}`);
  check("圆柱面（可展面）K = 0", Math.abs(Kc) < 1e-12*Math.max(1,c*c), `K = ${Kc.toExponential(3)}`);
  check("穹隆与鞍部符号相反", Math.sign(Kd) === -Math.sign(Ks));
}

/* ============================================================ F */
console.log("\n─── F. 曲面网格 ───");
{
  const [L] = reset([{ f:(x,y)=>600+160*Math.sin(x/431)*Math.cos(y/367) }]);
  const m = api.meshSurf[0];
  let nan = 0;
  for (let i=0;i<m._pos.length;i++) if (!Number.isFinite(m._pos[i])) nan++;
  let x0=1e9,x1=-1e9;
  for (let i=0;i<m._pos.length;i+=3){ x0=Math.min(x0,m._pos[i]); x1=Math.max(x1,m._pos[i]); }
  check("顶点无 NaN", nan === 0, `${m._pos.length/3} 顶点 / ${m.n} 索引`);
  check("图幅范围正确", Math.abs(x0)<1e-6 && Math.abs(x1-api.mapL())<1e-6, `0 ~ ${api.mapL()} m`);
  check("每个顶点带 4 分量颜色（含逐顶点透明度）",
        m._col.length === m._pos.length/3*4, `${m._col.length} 个数`);
  void L;
}

/* ============================================================ G */
console.log("\n─── G. 骨架网格 ───");
{
  reset([{ f:(x,y)=>600+0.2*Math.abs(x-2000) }]);
  const N = S.res, cells=(N-1)*(N-1);
  check("线框有法线缓冲", !!api.meshWire.nrm);
  check("手柄有法线缓冲", !!api.meshHandles.nrm);
  const segs = 2*N*(N-1) + cells;
  check("线框 = 全部网格边 + 每格一条对角线（无重复边）",
        api.meshWire._pos.length/3 === segs*2,
        `横 ${N*(N-1)} + 竖 ${N*(N-1)} + 对角 ${cells} = ${segs} 条`);
  check("手柄数 = 控制点数", api.meshHandles._pos.length/3 === N*N, `${N*N} 个`);
}

/* ============================================================ H */
console.log("\n─── H. 绘制模式 ───");
{
  reset([{ f:(x,y)=>600 }, { f:(x,y)=>900 }]);
  draws.length = 0;
  api.render();
  const TRI=GLC.TRIANGLES, LIN=GLC.LINES, PTS=GLC.POINTS;
  const wireV = api.meshWire._pos.length/3;
  const has=(m,c)=>draws.some(d=>d.mode===m && d.count===c);
  check("线框用 LINES 模式绘制", has(LIN, wireV), `${wireV} 顶点`);
  check("线框没有被当成三角形绘制", !has(TRI, wireV));
  check("层面用 TRIANGLES 绘制", has(TRI, api.meshSurf[0].n), `索引 ${api.meshSurf[0].n}`);
  check("控制点手柄用 POINTS 绘制", has(PTS, api.meshHandles._pos.length/3));
}

/* ============================================================ I */
console.log("\n─── I. 沉积次序透明规则（逐点验证） ───");
{
  // 情形 1：次序高的整体在上方 → 规则不应触发
  let [A, B] = reset([
    { name:"老", order:1, f:()=>600 },
    { name:"新", order:2, f:()=>900 },
  ]);
  let allOn = true;
  for (const L of S.layers) for (let q=0;q<SZ;q++) if (L.S[q] < 0) allOn = false;
  check("叠置正常时规则不触发（没有任何顶点被判为透明）", allOn);

  // 情形 2：把次序高的层面压到次序低的之下
  [A, B] = reset([
    { name:"老", order:1, f:()=>600 },
    { name:"新", order:2, f:(x,y)=>600 + 0.25*x - 500 },   // 向东逐渐降到 600 以下
  ]);
  let mismatch = 0, hiddenA = 0, hiddenB = 0, predicted = 0, worstGap = 0;
  for (let q=0;q<SZ;q++) {
    const shouldHide = (B.Z[q] < A.Z[q]);                  // 高次序(B)在本处之下 → 低次序(A)应透明
    if (shouldHide) predicted++;
    // S 是有符号场：透明 ⟺ S < 0；而且 S 的大小应等于两者的实际高差
    if ((A.S[q] < 0) !== shouldHide) mismatch++;
    if (A.S[q] < 0) hiddenA++;
    if (B.S[q] < 0) hiddenB++;
    worstGap = Math.max(worstGap, Math.abs(A.S[q] - (B.Z[q] - A.Z[q])));
  }
  check("透明判据逐点等于定义：∃ 更高次序层面压在其下",
        mismatch === 0, `${SZ} 个顶点中 ${predicted} 个应透明，不符 ${mismatch} 个`);
  check("S 场的大小等于两者的真实高差（不是 0/1 开关）",
        worstGap < 1e-3, `最大差 ${worstGap.toExponential(2)} m`);
  check("规则是单边的：高次序层面自己永不被这条规则变透明",
        hiddenB === 0, `B 被判为透明 ${hiddenB} 点`);
  check("被压在下方的低次序层面确实变透明了", hiddenA > 0, `A 被变透明 ${hiddenA} 点`);

  // 关掉规则后应当全部恢复
  S.orderRule = false; api.computeAlpha();
  let restored = true;
  for (const L of S.layers) for (let q=0;q<SZ;q++) if (L.S[q] < 0) restored = false;
  check("关闭规则后不再有任何透明顶点", restored);
  S.orderRule = true;
}

/* ============================================================ J */
console.log("\n─── J. 沉积次序越高 → 高度越高 ───");
{
  S.layers = []; S.active = 0; S.res = 9;
  const A = api.addLayer(false); api.seedLayer(A, 'hills');
  const B = api.addLayer(true);                              // 应当自动放到最上面
  const C = api.addLayer(true);
  const above = (hi, lo) => {
    for (let q=0;q<hi.z.length;q++) if (hi.z[q] <= lo.z[q]) return false;
    return true;
  };
  check("新加层面的次序高于已有层面", B.order > A.order && C.order > B.order,
        `次序 ${A.order} < ${B.order} < ${C.order}`);
  check("新加层面的高程高于已有层面", above(B,A) && above(C,B), "逐控制点全部更高");
}

/* ============================================================ K */
console.log("\n─── K. 层面交线 ───");
{
  // 交叉：水平面 700 与倾斜面（穿过 700）
  let [A, B] = reset([
    { order:1, f:()=>700 },
    { order:2, f:(x,y)=>700 + (x-2000)*0.3 },
  ]);
  check("交叉的两层产生交线", api.meshInter.length > 0, `${api.meshInter.length} 个交线网格`);

  // 窄带有宽度，只能验它的【中心线】：每片 6 顶点 A1 A2 B2 A1 B2 B1
  let worst = 0, n = 0;
  for (const m of api.meshInter) {
    const P = m._pos;
    for (let k = 0; k < P.length; k += 18) {
      const x1 = (P[k]   + P[k+3]) /2, y1 = (P[k+1] + P[k+4]) /2;   // (A1+A2)/2
      const x2 = (P[k+6] + P[k+15])/2, y2 = (P[k+7] + P[k+16])/2;   // (B2+B1)/2
      for (const [x,y] of [[x1,y1],[x2,y2]]) {
        worst = Math.max(worst,
          Math.abs(evalSurf(A,x,y,M()).z - evalSurf(B,x,y,M()).z));
        n++;
      }
    }
  }
  check("窄带中心线落在真交线上（两层高程相等）", worst < 3,
        `${n} 点，最大偏差 ${worst.toFixed(3)} m`);

  // 不交叉：两层平行的水平面
  [A, B] = reset([{ order:1, f:()=>600 }, { order:2, f:()=>1000 }]);
  check("不交叉的两层没有交线", api.meshInter.length === 0);
}

/* ============================================================ L */
console.log("\n─── L. 列表显示顺序：下老上新 ───");
{
  S.layers = []; S.res = 9;
  const mk = (name, order) => {
    const L = api.mkLayer(name, order, [150,150,150], 0.5);
    L.z = new Float32Array(S.res*S.res);
    return L;
  };
  const mid = mk('中', 2), neu = mk('新', 3), old = mk('老', 1);
  S.layers = [mid, neu, old];                 // 数组顺序故意打乱
  const shown = api.sortedLayers();
  check("列表按沉积次序降序排列（最上面 = 最新）",
        shown.map(o=>o.L.order).join(',') === '3,2,1',
        `显示顺序 ${shown.map(o=>o.L.name).join(' → ')}`);
  check("排序不改变 S.layers 本身",
        S.layers.map(L=>L.order).join(',') === '2,3,1');
  check("每项带回真实下标，编辑目标不会错位",
        shown.every(o => S.layers[o.i] === o.L));
}

/* ============================================================ M */
console.log("\n─── M. Shift 多选 + 整组升降 ───");
{
  const [L] = reset([{ f:()=>600 }]);
  S.active = 0;
  const cvEl = reg['gl'], N = S.res;
  const MVP = api.camMVP();
  const s00 = api.project(api.activeCtrl(0,0), MVP);
  const s88 = api.project(api.activeCtrl(8,8), MVP);
  const i00 = 0, i88 = 8*N+8;

  // Shift 依次点两个控制点
  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:s00[0], clientY:s00[1], shiftKey:true });
  winEl.dispatchEvent({ type:'mouseup' });
  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:s88[0], clientY:s88[1], shiftKey:true });
  winEl.dispatchEvent({ type:'mouseup' });
  check("Shift 点击可累加选择控制点", api.selSet.size === 2, `选中 ${api.selSet.size} 个`);

  // 拖动其中任一个 → 整组一起升降
  const z0 = L.z[i00], z8 = L.z[i88], zMid = L.z[4*N+4];
  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:s88[0], clientY:s88[1], shiftKey:false });
  winEl.dispatchEvent({ type:'mousemove', clientX:s88[0], clientY:s88[1]-40 });
  winEl.dispatchEvent({ type:'mouseup' });
  const d0 = L.z[i00]-z0, d8 = L.z[i88]-z8;
  check("整组一起动：两个选中点位移完全相同", Math.abs(d0-d8) < 1e-3, `Δ=${d0.toFixed(1)} / ${d8.toFixed(1)} m`);
  check("上拖 → 一起升高", d0 > 0 && d8 > 0, `Δ=${d0.toFixed(1)} m`);
  check("未选中的控制点纹丝不动", Math.abs(L.z[4*N+4]-zMid) < 1e-6);
}

/* ============================================================ N */
console.log("\n─── N. 空格 = 整个面上下平移 ───");
{
  const [L] = reset([{ f:(x,y)=>600 + 0.2*Math.abs(x-2000) }]);   // 有起伏，便于检查"形不变"
  S.active = 0;
  const before = Array.from(L.z);
  const cvEl = reg['gl'];
  winEl.dispatchEvent({ type:'keydown', code:'Space', preventDefault(){} });
  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:500, clientY:400 });
  winEl.dispatchEvent({ type:'mousemove', clientX:500, clientY:360 });
  winEl.dispatchEvent({ type:'mouseup' });
  winEl.dispatchEvent({ type:'keyup', code:'Space' });

  const d = before.map((v,k) => L.z[k]-v);
  const allSame = d.every(v => Math.abs(v-d[0]) < 1e-3);
  check("所有控制点位移完全相同（刚体升降）", allSame, `Δ=${d[0].toFixed(1)} m`);
  check("上拖 → 整体升高", d[0] > 0, `Δ=${d[0].toFixed(1)} m`);
  check("面形不变（只是整体平移）",
        before.every((v,k) => Math.abs((L.z[k]-d[0]) - v) < 1e-3));
  // 松开空格后，拖动应恢复成单点编辑：点中一个控制点，只有它动
  const s44 = api.project(api.activeCtrl(4,4), api.camMVP());
  const snap2 = Array.from(L.z);
  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:s44[0], clientY:s44[1] });
  winEl.dispatchEvent({ type:'mousemove', clientX:s44[0], clientY:s44[1]-40 });
  winEl.dispatchEvent({ type:'mouseup' });
  let moved = 0;
  for (let k=0;k<L.z.length;k++) if (Math.abs(L.z[k]-snap2[k]) > 1e-6) moved++;
  check("松开空格后恢复单点编辑（只有命中的那一个点动）", moved === 1, `${moved} 个点被改动`);
}

/* ============================================================ O */
console.log("\n─── O. 保存 / 打开 往返一致 ───");
{
  S.layers = []; S.res = 9;
  const a = api.mkLayer('老', 1, [200,120,90], 0.4);
  a.z = new Float32Array(81).fill(500);
  const b = api.mkLayer('新', 5, [90,140,200], 0.7);
  b.z = new Float32Array(81).fill(900); b.vis = false;
  S.layers = [a,b]; S.active = 0; S.surf = 'approx';
  S.interColor = [0.1, 0.9, 0.4]; S.interAlpha = 0.35;
  S.contourInt = 250; S.contourColor = [0.7, 0.2, 0.6]; S.contourAlpha = 0.45;
  S.showContour = false;
  S.mapMode = 'gray'; S.mapContour = false; S.mapInter = false;
  S.contourLabel = false;
  api.rebuild(false); api.render();
  const before = JSON.stringify(api.snapshot());

  // 故意破坏状态
  S.res = 5; S.surf = 'interp';
  const c = api.mkLayer('x', 1, [0,0,0], 1); c.z = new Float32Array(25);
  S.layers = [c];
  api.loadText(before);

  const after = JSON.stringify(api.snapshot());
  check("保存→打开后状态逐字节一致", before === after,
        before === after ? `${S.layers.length} 个层面` : '往返不一致');
  check("分辨率与曲面类型一并恢复", S.res === 9 && S.surf === 'approx', `${S.res} / ${S.surf}`);
  check("颜色 / 透明度 / 次序 / 显隐都恢复",
        S.layers[0].color.join() === '200,120,90' &&
        Math.abs(S.layers[0].alpha-0.4) < 1e-6 &&
        S.layers[1].order === 5 && S.layers[1].vis === false);
  check("拒绝打开非本程序的文件",
        (() => { try { api.loadText('{"format":"other"}'); return false; }
                 catch (e) { return true; } })());
  check("拒绝层面数据长度与分辨率不符的文件",
        (() => { try {
          api.loadText(JSON.stringify({ format:'outcrop-skeleton', res:9,
            layers:[{ name:'x', order:1, color:[1,2,3], alpha:1, z:[1,2,3] }] }));
          return false; } catch (e) { return true; } })());
}

/* ============================================================ P */
console.log("\n─── P. 先后遮挡：层面与交线都要参与深度测试 ───");
{
  // 两层交叉 → 产生交线
  reset([
    { order:1, f:()=>700 },
    { order:2, f:(x,y)=>700 + (x-2000)*0.3 },
  ]);
  check("两层交叉确实生成了交线", api.meshInter.length > 0, `${api.meshInter.length} 个交线网格`);

  draws.length = 0;
  api.render();
  const TRI = GLC.TRIANGLES, PTS = GLC.POINTS;
  const surfCounts  = api.meshSurf.filter(Boolean).map(m => m.n);
  const interCounts = api.meshInter.map(m => m.n);

  const surfDraws = draws.filter(d => d.mode===TRI && surfCounts.includes(d.count));
  check("层面绘制时深度测试开启", surfDraws.length > 0 && surfDraws.every(d => d.dt === true),
        `${surfDraws.length} 次`);
  check("层面绘制时写深度（这是层面互相遮挡的前提）",
        surfDraws.length > 0 && surfDraws.every(d => d.dm === true));

  const interDraws = draws.filter(d => d.mode===TRI && interCounts.includes(d.count));
  check("交线是在【深度测试开启】时绘制的（之前的 bug：骨架透视提前关掉了它）",
        interDraws.length > 0 && interDraws.every(d => d.dt === true),
        `${interDraws.length} 次交线绘制`);
  check("交线写深度，能被更近的层面挡住",
        interDraws.every(d => d.dm === true));

  const ptDraws = draws.filter(d => d.mode===PTS);
  check("控制点手柄仍然穿透可见（关掉深度测试，编辑时永远抓得着）",
        ptDraws.length > 0 && ptDraws.every(d => d.dt === false), `${ptDraws.length} 次`);

  const contourCounts = api.meshContour.map(m => m.n);
  const cDraws = draws.filter(d => d.mode===TRI && contourCounts.includes(d.count));
  check("等高线同样在深度测试开启时绘制（会被前面的层面遮住）",
        cDraws.length > 0 && cDraws.every(d => d.dt === true), `${cDraws.length} 次`);

  check("片元着色器用连续场判定透明（不是逐顶点开关）",
        /vS\s*<\s*0\.0/.test(api.FS_SURF) && /varying float vS/.test(api.FS_SURF));
  check("片元着色器用 uTint 给交线着色（改颜色不必重建几何）",
        /uTint/.test(api.FS_SURF));

  let allWhite = true;
  for (const m of api.meshInter) for (let i=0;i<m._col.length;i+=4)
    if (m._col[i]!==1 || m._col[i+1]!==1 || m._col[i+2]!==1) allWhite = false;
  check("交线顶点色为白，颜色完全由 uniform 控制", allWhite);

  check("交线颜色 / 不透明度是运行时状态，改它不需要重建几何",
        typeof S.interColor !== 'undefined' && typeof S.interAlpha !== 'undefined' &&
        Array.isArray(S.interColor) && S.interColor.length === 3);
}

/* ============================================================ Q */
console.log("\n─── Q. 最高次序层面的等高线（构造等高线）───");
{
  // 倾斜平面：高程 620 → 1420，等高距 100 → 应恰好 8 条（700…1400）
  const [L] = reset([{ name:'顶面', order:1, f:(x,y)=>620 + 0.2*x }]);
  S.active = 0; S.contourInt = 100; S.showContour = true;
  api.rebuild(false);
  check("等高线条数 = 高程范围内按等高距取的整倍数个数",
        api.contourInfo.levels === 8, `实测 ${api.contourInfo.levels} 条`);
  check("等高线画在最高次序的层面上", api.contourInfo.name === '顶面');
  check("等高线几何已生成", api.meshContour.length > 0, `${api.contourInfo.segs} 段`);

  // 关键：线上每点的【真实高程】必须等于该条的标注高度
  let worst = 0, tested = 0;
  for (const lv of [700, 900, 1100, 1300]) {
    const F = new Float32Array(api.SZ);
    for (let q=0;q<api.SZ;q++) F[q] = L.Z[q] - lv;
    for (const P of api.stitchContours(F))
      for (const [x,y] of P) {
        worst = Math.max(worst, Math.abs(evalSurf(L, x, y, M()).z - lv));
        tested++;
      }
  }
  check("等高线上每点的高程 = 该条的标注高度", worst < 1.0,
        `${tested} 点，最大偏差 ${worst.toFixed(4)} m`);

  // 等高距 250 → 620~1420 内应有 750 / 1000 / 1250 三条
  S.contourInt = 250; api.rebuild(false);
  check("改等高距后条数随之变化", api.contourInfo.levels === 3,
        `等高距 250 m → ${api.contourInfo.levels} 条`);

  S.showContour = false; api.rebuild(false);
  check("关闭后不生成等高线几何", api.meshContour.length === 0);
  S.showContour = true;

  // 多层时取沉积次序最高的那个，与数组顺序无关
  reset([
    { name:'老', order:1, f:()=>500 },
    { name:'新', order:7, f:()=>1500 },
    { name:'中', order:3, f:()=>1000 },
  ]);
  api.rebuild(false);
  check("多层时取沉积次序最高的层面（次序 7）", api.contourInfo.name === '新',
        `画在「${api.contourInfo.name}」上`);
  check("被隐藏的最高次序层面不参与（改取次高的可见层面）", (() => {
    S.layers[1].vis = false; api.rebuild(false);
    const ok = api.contourInfo.name === '中';
    S.layers[1].vis = true;
    return ok;
  })(), '隐藏「新」后画在「中」上');
}

/* ============================================================ R */
console.log("\n─── R. 交线窄带必须骑在两张面之上（锯齿 / 透明缺口的根因）───");
{
  // 两层以大夹角相交：只贴其中一张面的做法，另一半必然沉到另一张之下
  const [A, B] = reset([
    { order:1, f:(x,y)=>800 + (x-2000)*0.28 },
    { order:2, f:(x,y)=>800 - (x-2000)*0.28 },
  ]);
  api.rebuild(false);
  check("两层相交生成了交线", api.meshInter.length > 0, `${api.meshInter.length} 个网格`);

  let below = 0, worst = 0, n = 0, maxUp = 0;
  for (const m of api.meshInter) {
    for (let k=0;k<m._pos.length;k+=3) {
      const x=m._pos[k], y=m._pos[k+1], z=m._pos[k+2];
      const za = api.sampleSurface(A.Z, x, y), zb = api.sampleSurface(B.Z, x, y);
      const d = z - Math.max(za, zb);          // 相对"两张面中较高的那张"
      if (d < -1e-6) { below++; worst = Math.min(worst, d); }
      maxUp = Math.max(maxUp, d);
      n++;
    }
  }
  check("每个顶点都不低于两张面（否则会被深度测试切出透明缺口）",
        below === 0, `${n} 个顶点，沉面 ${below} 个` + (below ? `，最深 ${worst.toFixed(2)} m` : ''));
  check("抬升量受控，不会浮成一条悬空的线", maxUp < 3.0, `最大抬升 ${maxUp.toFixed(2)} m`);
}

/* ============================================================ S */
console.log("\n─── S. 右侧平面图 ───");
{
  reset([
    { name:'老', order:1, f:()=>500 },
    { name:'新', order:6, f:(x,y)=>1000 + 0.1*x },
  ]);
  api.rebuild(false);
  check("平面图取沉积次序最高的层面", api.mapState.name === '新', `画的是「${api.mapState.name}」`);
  check("平面图高程范围与层面一致",
        Math.abs(api.mapState.lo - 1000) < 1 && Math.abs(api.mapState.hi - 1400) < 1,
        `${api.mapState.lo.toFixed(0)} ~ ${api.mapState.hi.toFixed(0)} m`);

  let ok = true;
  for (const m of ['gray', 'user', 'color']) {
    try { S.mapMode = m; api.drawMap(); } catch (e) { ok = false; }
  }
  check("彩色 / 黑白 / 层面自身色 三种模式都能正常出图", ok);
  S.mapMode = 'color';
  try { S.mapContour = false; api.drawMap(); S.mapContour = true; api.drawMap(); }
  catch (e) { ok = false; }
  check("等高线开关都能正常出图", ok);

  S.layers[1].vis = false; api.rebuild(false);
  check("最高次序层面被隐藏时，平面图改画次高的可见层面",
        api.mapState.name === '老', `画的是「${api.mapState.name}」`);
  S.layers[1].vis = true;
}

/* ============================================================ T */
console.log("\n─── T. 等高线高程标注（断线 + 沿线方向 + 自动避让）───");
{
  const [L] = reset([{ name:'顶面', order:1, f:(x,y)=>620 + 0.2*x }]);
  S.contourInt = 100; S.showContour = true; S.contourLabel = true;
  api.rebuild(false);
  const A = api.contourAnchors;
  check("生成了标注锚点", A.length > 0,
        `${A.length} 个 / ${api.contourInfo.levels} 条等高线`);

  // 锚点必须落在它标注的那条等高线上
  let worst = 0;
  for (const a of A) worst = Math.max(worst, Math.abs(evalSurf(L, a.x, a.y, M()).z - a.v));
  check("锚点落在它标注的那条等高线上", worst < 1.0, `最大偏差 ${worst.toFixed(4)} m`);

  // 自动避让：两两间距不得小于设定值
  let minD = Infinity;
  for (let i=0;i<A.length;i++) for (let j=i+1;j<A.length;j++)
    minD = Math.min(minD, Math.hypot(A[i].x-A[j].x, A[i].y-A[j].y));
  const sep = api.mapL()*0.16;
  check("标注之间互不挤在一起（最小间距约束生效）",
        A.length < 2 || minD >= sep - 1e-9,
        `最小间距 ${minD.toFixed(0)} m ≥ 设定 ${sep.toFixed(0)} m`);

  check("每个标注都带沿线的【单位】方向向量",
        A.every(a => Math.abs(Math.hypot(a.dx,a.dy,a.dz) - 1) < 1e-6));
  const along = A.every(a => {
    const s = evalSurf(L, a.x + a.dx*40, a.y + a.dy*40, M()).z;
    return Math.abs(s - a.v) < 1.0;              // 沿该方向走 40 m，高程基本不变 = 确实沿等高线
  });
  check("方向确实沿等高线方向（沿线走高程不变）", along);

  check("等高线在标注处断开（数字嵌在缺口里）",
        api.contourInfo.cut > 0, `断开 ${api.contourInfo.cut} 段`);

  S.contourLabel = false; api.rebuild(false);
  check("关闭标注后不断线、无锚点",
        api.contourInfo.cut === 0 && api.contourAnchors.length === 0);
  S.contourLabel = true; api.rebuild(false);

  // 渲染一遍，检查 3D 标注层真的写出了带旋转的数字
  api.render();
  const spans = reg['labels'].children.filter(sp => sp.style.display !== 'none');
  check("3D 标注写出了高程数字",
        spans.length > 0 && spans.every(sp => /^\d+$/.test(sp.textContent)),
        spans.length ? `例如「${spans[0].textContent}」` : '');
  check("3D 标注带沿线方向的旋转",
        spans.length > 0 && spans.every(sp => /rotate\(-?[\d.]+deg\)/.test(sp.style.transform)),
        spans.length ? spans[0].style.transform : '');
}

/* ============================================================ U */
console.log("\n─── U. 平面图上的交线 ───");
{
  reset([
    { order:1, f:()=>700 },
    { order:2, f:(x,y)=>700 + (x-2000)*0.3 },
  ]);
  S.mapInter = true; api.rebuild(false);
  check("相交的两层在平面图上画出交线", api.mapInterSegs > 0, `${api.mapInterSegs} 段`);
  S.mapInter = false; api.rebuild(false);
  check("关掉「显示交线」后平面图不再画", api.mapInterSegs === 0);
  S.mapInter = true;

  reset([{ order:1, f:()=>600 }, { order:2, f:()=>1000 }]);
  api.rebuild(false);
  check("不交叉的两层在平面图上没有交线", api.mapInterSegs === 0);
}

/* ============================================================ T2 */
console.log("\n─── T2. 缺口必须是沿线胶囊，且不能横切邻近等高线 ───");
{
  // 陡坡 + 小等高距 → 等高线很密（间距仅 100 m），最容易暴露问题
  reset([{ name:'斜面', order:1, f:(x,y)=>620 + 0.2*x }]);
  S.contourInt = 20; S.showContour = true; S.contourLabel = true;
  api.rebuild(false);
  const ci = api.contourInfo;
  check("构造出稠密等高线场景", ci.levels >= 20, `${ci.levels} 条，相邻间距 100 m`);

  const labLevels = new Set(api.contourAnchors.map(a => a.v));
  let crossCut = 0;
  for (const [lv] of ci.cutByLevel) if (!labLevels.has(lv)) crossCut++;
  check("没有被【别的层】的数字切断的等高线", crossCut === 0,
        `被切的 ${ci.cutByLevel.size} 条全部有标注（有标注的共 ${labLevels.size} 条）`);

  const perLabel = ci.cut / Math.max(1, api.contourAnchors.length);
  check("每个数字只吃掉本线上一小段（不是一大片圆）", perLabel < 15,
        `平均每个数字切断 ${perLabel.toFixed(1)} 段`);

  const maxHalfW = Math.max(...api.contourAnchors.map(a => a.halfW));
  check("缺口垂直半宽远小于等高线间距（碰不到邻线）",
        maxHalfW * 2 < 100, `缺口宽 ${(maxHalfW*2).toFixed(0)} m ≪ 线距 100 m`);

  const ratios = api.contourAnchors.map(a => a.half / a.halfW);
  check("缺口沿等高线方向拉长（不是各向同性的圆）",
        Math.min(...ratios) > 2, `长宽比最小 ${Math.min(...ratios).toFixed(1)}`);

  check("数字不再有白色描边", !/strokeText/.test(scriptSrc), '');
  const css = html.match(/#labels span\s*\{[^}]*\}/);
  check("3D 标注不再有白色底框", !!css && !/background/.test(css[0]),
        css ? '样式里已无 background' : '未找到样式');
}

/* ============================================================ V */
console.log("\n─── V. 交线窄带必须是【连续条带】，不是一节节独立小片 ───");
{
  // 起伏面相交：旧的"每格各做一条小带"在这里必然接缝错开 → 网格频率锯齿
  reset([
    { order:1, f:(x,y)=>800 + 60*Math.sin(x/500) + 40*Math.cos(y/430) },
    { order:2, f:(x,y)=>800 - 60*Math.sin(x/500) - 40*Math.cos(y/430) },
  ]);
  api.rebuild(false);
  check("生成了交线几何", api.meshInter.length > 0);

  let joints = 0, joined = 0;
  for (const m of api.meshInter) {
    const P = m._pos, quads = P.length / 18;
    for (let k = 0; k + 1 < quads; k++) {
      const o = k*18, o2 = (k+1)*18;
      // 下一片的 A1/A2 应当与上一片的 B1/B2 完全重合
      const d =
        Math.abs(P[o2]   - P[o+15]) + Math.abs(P[o2+1] - P[o+16]) + Math.abs(P[o2+2] - P[o+17]) +
        Math.abs(P[o2+3] - P[o+6])  + Math.abs(P[o2+4] - P[o+7])  + Math.abs(P[o2+5] - P[o+8]);
      joints++;
      if (d < 1e-6) joined++;
    }
  }
  const ratio = joints ? joined / joints : 0;
  check("相邻四边形共用顶点（窄带连续，接缝不错开）", joints > 20 && ratio > 0.9,
        `${joined}/${joints} 处接缝重合（${(ratio*100).toFixed(0)}%）`);
}

/* ============================================================ W */
console.log("\n─── W. 拖动灵敏度（不能随手一拖就上千千米）───");
{
  const [L] = reset([{ f:()=>600 }]);
  S.active = 0; S.dragSens = 0.3;
  api.rebuild(true);
  const cvH = reg['gl'].clientHeight;
  const mpp = api.worldPerPixel();
  check("每像素对应的米数在合理范围", mpp > 0.3 && mpp < 4, `当前 ${mpp.toFixed(2)} m/px`);
  check("拖满整个画布高度也远不到 3000 m（这正是原来的毛病）",
        mpp * cvH < 2500, `画布高 ${cvH} px = ${(mpp*cvH).toFixed(0)} m`);

  const s44 = api.project(api.activeCtrl(4,4), api.camMVP());
  const z0 = L.z[4*S.res+4];
  const cvEl = reg['gl'];
  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:s44[0], clientY:s44[1] });
  winEl.dispatchEvent({ type:'mousemove', clientX:s44[0], clientY:s44[1]-100 });
  winEl.dispatchEvent({ type:'mouseup' });
  const dz = L.z[4*S.res+4] - z0;
  check("上拖 100 px 的升降量与标称一致",
        Math.abs(dz - 100*mpp) < 0.01*Math.abs(100*mpp) + 1e-6,
        `实际 ${dz.toFixed(1)} m，标称 ${(100*mpp).toFixed(1)} m`);

  S.dragSens = 1.0;
  check("灵敏度可调，每像素米数按比例变化",
        Math.abs(api.worldPerPixel()/mpp - 1/0.3) < 1e-6,
        `1.0 → ${api.worldPerPixel().toFixed(2)} m/px`);
  S.dragSens = 0.3;
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`);process.exit(fail ? 1 : 0);
