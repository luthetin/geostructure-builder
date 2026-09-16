/* ============================================================
   skeleton-check.js —— 多层面地层编辑器 检验
   ------------------------------------------------------------
   用假 WebGL + 假 DOM 让 index.html 的脚本在 Node 里跑起来，
   对数学、规则、几何、交互做数值断言。

   模型：ifaces[0..n-1] 自下而上的交界面；strata[0..n-2] 是夹在
   相邻两个交界面之间的地层体。n 个交界面 ⇒ n−1 个地层。

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
  COLOR_BUFFER_BIT:16, DEPTH_BUFFER_BIT:17, LINES:18, CULL_FACE:19, FRONT:20, BACK:21 };
const draws = [];
let gDT = false, gDM = true, gCull = null;
const fakeGL = new Proxy({
  getShaderParameter: () => true, getProgramParameter: () => true,
  createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
  deleteBuffer: () => {}, getAttribLocation: () => 0, getUniformLocation: () => ({}),
  getShaderInfoLog: () => "", getProgramInfoLog: () => "",
  createImageData: (w, h) => ({ width:w, height:h, data: new Uint8ClampedArray(w*h*4) }),
  getImageData:    (x, y, w, h) => ({ width:w, height:h, data: new Uint8ClampedArray(w*h*4) }),
  measureText:     (t) => ({ width: String(t).length * 6 }),
  enable:  (cap) => { if (cap === GLC.DEPTH_TEST) gDT = true; if (cap === GLC.CULL_FACE) gCull = GLC.BACK; },
  disable: (cap) => { if (cap === GLC.DEPTH_TEST) gDT = false; if (cap === GLC.CULL_FACE) gCull = null; },
  cullFace: (f) => { gCull = f; },
  depthMask: (v) => { gDM = !!v; },
  drawArrays:   (mode, first, count) => { draws.push({ mode, count, dt:gDT, dm:gDM, cull:gCull }); },
  drawElements: (mode, count)        => { draws.push({ mode, count, dt:gDT, dm:gDM, cull:gCull }); },
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

const sandbox = { document: doc, window: winEl, requestAnimationFrame: ()=>{}, console, Event: Ev };
const epilogue = `
globalThis.__api = {
  S, SPACING, NS, SZ, MAT_CR, MAT_BS, evalSurf, mapL, mat,
  mkIface, mkStratum, addStratum, delStratum, seedIface, relaxIface, resampleAll,
  evalIface, computeIfaceFields, computeStratumFields, stratumAlpha,
  buildStratum, buildIfaceSurface, buildIntersections, topIface,
  stitchContours, emitRibbon, smoothPoly, polysToSegs, sampleSurface,
  rebuild, render, zRange, camMVP, camEye, project, activeCtrl, pick, worldPerPixel,
  FS_SURF, drawMap, snapshot, loadText, selSet, buildStratumList,
  get contours(){ return contourInfo; }, get anchors(){ return contourAnchors; },
  get meshStrata(){ return meshStrata; }, get meshWire(){ return meshWire; },
  get meshIfaces(){ return meshIfaces; },
  get meshHandles(){ return meshHandles; }, get meshInter(){ return meshInter; },
  get meshContour(){ return meshContour; }, get mapState(){ return mapState; },
  get mapInterSegs(){ return mapInterSegs; },
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
const M = () => MAT_CR;

/* 按给定的交界面高程函数建场景；返回交界面数组 */
function reset(fns) {
  S.ifaces = []; S.strata = []; S.res = 9;
  S.orderRule = true; S.showIface = true; S.curv = false; S.surf = 'interp';
  S.showWire = true; S.showFill = false; S.showHandles = true;
  S.xray = true; S.inter = true;
  S.showContour = true; S.contourInt = 100; S.contourLabel = true;
  S.mapMode = 'color'; S.mapContour = true; S.mapInter = true;
  S.dragSens = 0.3;
  api.selSet.clear();
  fns.forEach((f, i) => {
    const I = api.mkIface('交界面 ' + (i+1));
    I.z = new Float32Array(S.res*S.res);
    for (let j=0;j<S.res;j++) for (let k=0;k<S.res;k++)
      I.z[j*S.res+k] = f(k*SPACING, j*SPACING);
    S.ifaces.push(I);
  });
  for (let k=0;k<S.ifaces.length-1;k++)
    S.strata.push(api.mkStratum('地层 '+(k+1), [150,150,150], 0.7));
  S.active = S.ifaces.length-1;
  api.rebuild(false);
  return S.ifaces;
}

/* ============================================================ A0 */
console.log("\n─── A0. 预设场景（必须在任何 reset 之前检查）───");
{
  check("预设是 2 个交界面 + 1 个地层",
        S.ifaces.length === 2 && S.strata.length === 1,
        `${S.ifaces.length} 交界面 / ${S.strata.length} 地层`);
  check("两个交界面都是平面（各自所有控制点等高）",
        S.ifaces.every(I => I.z.every(v => Math.abs(v - I.z[0]) < 1e-9)),
        `高程 ${S.ifaces[0].z[0].toFixed(0)} 与 ${S.ifaces[1].z[0].toFixed(0)} m`);
  const th = S.ifaces[1].z[0] - S.ifaces[0].z[0];
  check("地层有正厚度", th > 0, `${th.toFixed(0)} m`);
}

/* ============================================================ A */
console.log("\n─── A. Catmull-Rom 严格穿过控制点 ───");
{
  const [I] = reset([(x,y)=>600+300*Math.sin(x/900)+200*Math.cos(y/700)]);
  let worst = 0, N = S.res;
  for (let j=0;j<N;j++) for (let i=0;i<N;i++)
    worst = Math.max(worst, Math.abs(evalSurf(I, i*SPACING, j*SPACING, M()).z - I.z[j*N+i]));
  check("曲面在控制点处正好等于该点高程", worst < 1e-6, `最大偏差 ${worst.toExponential(2)} m`);
}

/* ============================================================ B */
console.log("\n─── B. B 样条的逼近性 ───");
{
  const [I] = reset([(x,y)=>600+300*Math.sin(x/900)+200*Math.cos(y/700)]);
  let maxMiss = 0, N = S.res;
  for (let j=1;j<N-1;j++) for (let i=1;i<N-1;i++)
    maxMiss = Math.max(maxMiss, Math.abs(evalSurf(I, i*SPACING, j*SPACING, MAT_BS).z - I.z[j*N+i]));
  check("B 样条确实不穿过控制点", maxMiss > 5, `最大偏离 ${maxMiss.toFixed(1)} m`);
  let lo=Infinity, hi=-Infinity;
  for (let k=0;k<I.z.length;k++){ lo=Math.min(lo,I.z[k]); hi=Math.max(hi,I.z[k]); }
  let out = 0;
  for (let b=0;b<=60;b++) for (let a=0;a<=60;a++) {
    const z = evalSurf(I, a*api.mapL()/60, b*api.mapL()/60, MAT_BS).z;
    if (z < lo-1e-6 || z > hi+1e-6) out++;
  }
  check("B 样条曲面不超出控制网高程范围", out === 0, out ? `${out} 点越界` : "全部在范围内");
}

/* ============================================================ C */
console.log("\n─── C. 解析法线 = 差分法线 ───");
{
  const [I] = reset([(x,y)=>600+0.0002*(x*x+y*y)+120*Math.sin(x/700)]);
  let worst = 0, cnt = 0, h = 2;
  for (let b=8;b<=52;b+=6) for (let a=8;a<=52;a+=6) {
    const x=a*api.mapL()/60, y=b*api.mapL()/60, s=evalSurf(I,x,y,M());
    const fx=(evalSurf(I,x+h,y,M()).z - evalSurf(I,x-h,y,M()).z)/(2*h);
    const fy=(evalSurf(I,x,y+h,M()).z - evalSurf(I,x,y-h,M()).z)/(2*h);
    const g=1/Math.hypot(-fx,-fy,1);
    worst = Math.max(worst, Math.hypot(s.nx-(-fx*g), s.ny-(-fy*g), s.nz-g)); cnt++;
  }
  check("解析法线与差分法线一致", worst < 1e-4, `${cnt} 点，最大差 ${worst.toExponential(2)}`);
}

/* ============================================================ D */
console.log("\n─── D. 抛物面曲率 = 解析值 c² ───");
{
  const c = 4e-4, cx = 2000, cy = 2000;
  const [I] = reset([(x,y)=>1000 + c/2*((x-cx)**2 + (y-cy)**2)]);
  const K = evalSurf(I, cx, cy, M()).K, exact = c*c;
  check("K 等于解析值 c²", Math.abs(K-exact)/exact < 0.01,
        `算得 ${K.toExponential(4)}，解析 ${exact.toExponential(4)}，相对误差 ${(Math.abs(K-exact)/exact*100).toFixed(3)}%`);
}

/* ============================================================ E */
console.log("\n─── E. 曲率符号：穹隆 / 鞍部 / 圆柱 ───");
{
  const c = 4e-4, cx = 2000, cy = 2000;
  let [I] = reset([(x,y)=>1000 - c/2*((x-cx)**2 + (y-cy)**2)]);
  const Kd = evalSurf(I, cx, cy, M()).K;
  [I] = reset([(x,y)=>1000 + c/2*((x-cx)**2 - (y-cy)**2)]);
  const Ks = evalSurf(I, cx, cy, M()).K;
  [I] = reset([(x,y)=>1000 + c/2*(x-cx)**2]);
  const Kc = evalSurf(I, cx, cy, M()).K;
  check("穹隆 K > 0", Kd > 0, `K = ${Kd.toExponential(3)}`);
  check("鞍部 K < 0", Ks < 0, `K = ${Ks.toExponential(3)}`);
  check("圆柱面（可展面）K = 0", Math.abs(Kc) < 1e-12*Math.max(1,c*c), `K = ${Kc.toExponential(3)}`);
  check("穹隆与鞍部符号相反", Math.sign(Kd) === -Math.sign(Ks));
}

/* ============================================================ F */
console.log("\n─── F. 地层实体几何（顶面 + 底面 + 四周侧壁）───");
{
  reset([(x,y)=>500, (x,y)=>900]);
  const m = api.meshStrata[0];
  const n = NS+1, expect = 2*n*n + 4*(n-1)*6;
  check("顶点数 = 顶面 + 底面 + 四壁", m._pos.length/3 === expect,
        `${m._pos.length/3} = 2×${n*n} + 4×${n-1}×6`);
  let nan = 0;
  for (let i=0;i<m._pos.length;i++) if (!Number.isFinite(m._pos[i])) nan++;
  check("无 NaN", nan === 0);

  let worst = 0;
  for (let q=0;q<SZ;q++) worst = Math.max(worst, Math.abs((S.ifaces[1].Z[q]-S.ifaces[0].Z[q]) - 400));
  check("上下界面确实相差 400 m（地层厚度）", worst < 1e-4, `最大偏差 ${worst.toExponential(2)} m`);
  check("叠置正常时地层透明场为正（规则不触发）",
        S.strata[0].S.every(v => v > 0),
        `场值 = 上下界面的高差 ${S.strata[0].S[0].toFixed(0)} m`);

  const capN = (q) => m._nrm[q*3+2];
  check("顶面法线朝上", capN(0) > 0.9, `nz = ${capN(0).toFixed(3)}`);
  check("底面法线朝下", capN(n*n) < -0.9, `nz = ${capN(n*n).toFixed(3)}`);
}

/* ============================================================ F2 */
console.log("\n─── F2. 侧壁绕序必须朝外 ───");
{
  reset([(x,y)=>500, (x,y)=>900]);
  const m = api.meshStrata[0];
  const n = NS+1, wallStart = 2*n*n;
  let bad = 0, checked = 0;
  for (let t = wallStart; t + 5 < m._pos.length/3; t += 6) {
    const P = (i) => [m._pos[(t+i)*3], m._pos[(t+i)*3+1], m._pos[(t+i)*3+2]];
    const a=P(0), b=P(1), c=P(2);
    const u=[b[0]-a[0], b[1]-a[1], b[2]-a[2]], v=[c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    const cr=[u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const midx=(a[0]+b[0]+c[0])/3, midy=(a[1]+b[1]+c[1])/3;
    const ox=midx-api.mapL()/2, oy=midy-api.mapL()/2;
    if (cr[0]*ox + cr[1]*oy <= 0) bad++;
    checked++;
  }
  check("每个侧壁三角形的几何法线都朝图幅外", bad === 0,
        `${checked} 个三角形，朝内 ${bad} 个`);
}

/* ============================================================ G */
console.log("\n─── G. 骨架网格 ───");
{
  reset([(x,y)=>600+0.2*Math.abs(x-2000), (x,y)=>1000]);
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
console.log("\n─── H. 绘制模式与两趟剔除 ───");
{
  reset([(x,y)=>500, (x,y)=>900]);
  draws.length = 0;
  api.render();
  const TRI=GLC.TRIANGLES, LIN=GLC.LINES, PTS=GLC.POINTS;
  const wireV = api.meshWire._pos.length/3;
  const has=(m,c)=>draws.some(d=>d.mode===m && d.count===c);
  check("线框用 LINES 模式绘制", has(LIN, wireV), `${wireV} 顶点`);
  check("线框没有被当成三角形绘制", !has(TRI, wireV));
  check("地层用 TRIANGLES 绘制", has(TRI, api.meshStrata[0].n), `索引 ${api.meshStrata[0].n}`);
  check("控制点手柄用 POINTS 绘制", has(PTS, api.meshHandles._pos.length/3));
  const culls = draws.filter(d => d.mode===TRI && d.count===api.meshStrata[0].n);
  check("地层分两趟画（先剔正面画背面，再剔背面画正面）",
        culls.length === 2 && culls[0].cull === GLC.FRONT && culls[1].cull === GLC.BACK,
        culls.map(d=>d.cull===GLC.FRONT?'FRONT':'BACK').join(' → '));
}

/* ============================================================ I */
console.log("\n─── I. 沉积次序透明规则 ───");
{
  reset([(x,y)=>600, (x,y)=>900]);
  check("叠置正常时规则不触发（所有场都为正）",
        S.ifaces.every(I => I.S.every(v => v > 0)) &&
        S.strata.every(st => st.S.every(v => v > 0)),
        `最小场值 ${Math.min(...S.strata[0].S).toFixed(0)} m`);

  reset([(x,y)=>600, (x,y)=>600 + 0.25*x - 500]);
  const bot = S.ifaces[0], top = S.ifaces[1];
  let mismatch = 0, negI = 0, negS = 0, falsePos = 0;
  for (let q=0;q<SZ;q++) {
    const shouldBeTransparent = (top.Z[q] < bot.Z[q]);   // 更高的界面压到了它下面
    if ((bot.S[q] < 0) !== shouldBeTransparent) mismatch++;
    if (bot.S[q] < 0) negI++;
    if (S.strata[0].S[q] < 0) negS++;
    if (top.S[q] < 0) falsePos++;                        // 最上面那个界面不该被判定透明
  }
  check("交界面的透明判据逐点等于定义：∃ 更高的界面压在其下",
        mismatch === 0, `${SZ} 点中 ${negI} 点应透明，不符 ${mismatch}`);
  check("交界面透明的地方，夹着它的地层也一起透明",
        negS === negI && negI > 0, `界面透明 ${negI} 点 / 地层透明 ${negS} 点`);
  check("地层的场 = 上下两界面场的较小者",
        S.strata[0].S.every((v,q) => v === Math.min(S.ifaces[0].S[q], S.ifaces[1].S[q])));
  check("最上面的界面不会被这条规则判为透明（规则是单边的）",
        falsePos === 0, `${falsePos} 点`);

  S.ifaces[0].alpha = 0; S.ifaces[1].alpha = 1;
  check("界面不透明度调低时，地层不透明度上限跟着降",
        api.stratumAlpha(0) === 0 && api.stratumAlpha(0) < S.strata[0].alpha,
        `地层 ${S.strata[0].alpha} → 上限 ${api.stratumAlpha(0)}`);
  S.ifaces[0].alpha = 1;
  check("界面恢复不透明后，地层回到自身不透明度",
        Math.abs(api.stratumAlpha(0) - S.strata[0].alpha) < 1e-9);

  S.orderRule = false; api.rebuild(false);
  check("关掉规则后不再有任何透明判定",
        S.ifaces.every(I => I.S.every(v => v >= 1e8)) &&
        S.strata.every(st => st.S.every(v => v >= 1e8)));
  S.orderRule = true;
  check("片元着色器在场上过零处丢弃（不是逐顶点开关）",
        /vS\s*<\s*0\.0/.test(api.FS_SURF) && /discard/.test(api.FS_SURF));
}

/* ============================================================ I2 */
console.log("\n─── I2. 交界面薄面（有自己的颜色与透明度）───");
{
  reset([(x,y)=>400, (x,y)=>700]);
  const list = api.meshIfaces.filter(Boolean);
  check("每个可见交界面都生成了薄面网格", list.length === 2, `${list.length} 个`);
  const m = api.meshIfaces[0];
  check("薄面顶点数 = 网格点数", m._pos.length/3 === SZ, `${m._pos.length/3}`);
  check("薄面颜色 = 该交界面的颜色",
        Math.abs(m._col[0]*255 - S.ifaces[0].color[0]) < 1,
        `rgb(${Math.round(m._col[0]*255)},${Math.round(m._col[1]*255)},${Math.round(m._col[2]*255)})`);
  let minLift = Infinity;
  for (let q=0;q<SZ;q++) minLift = Math.min(minLift, m._pos[q*3+2] - S.ifaces[0].Z[q]);
  check("薄面抬高了一点，避免和地层顶/底面 z-fighting", minLift > 1.0,
        `最小抬高 ${minLift.toFixed(2)} m`);
  S.showIface = false; api.rebuild(false);
  const gone = api.meshIfaces.every(x => !x);
  S.showIface = true; api.rebuild(false);
  check("关掉「显示交界面」后不再生成薄面", gone);
}

/* ============================================================ J */
console.log("\n─── J. 新建 / 删除地层 ───");
{
  reset([(x,y)=>400, (x,y)=>700]);
  check("n 个交界面 ⇒ n−1 个地层", S.ifaces.length === 2 && S.strata.length === 1);
  const before = S.ifaces.length;
  api.addStratum();
  check("新建地层在最上面加一个交界面",
        S.ifaces.length === before+1 && S.strata.length === before,
        `${S.ifaces.length} 交界面 / ${S.strata.length} 地层`);
  check("新交界面在上一个之上（逐控制点）",
        S.ifaces[2].z.every((v,q) => v > S.ifaces[1].z[q]));
  check("新建后自动选中地表", S.active === S.ifaces.length-1);

  const nStrata = S.strata.length;
  check("删除地层成功", api.delStratum(nStrata-1) === true);
  check("删除后交界面数同步减少",
        S.ifaces.length === 2 && S.strata.length === 1,
        `${S.ifaces.length} 交界面 / ${S.strata.length} 地层`);
  check("只剩一个地层时不允许再删", api.delStratum(0) === false);

  reset([(x,y)=>300, (x,y)=>600, (x,y)=>900]);
  check("三个交界面两个地层", S.strata.length === 2);
  api.delStratum(0);
  check("删掉下面那层后并成一个（交界面少一个，地层少一个）",
        S.ifaces.length === 2 && S.strata.length === 1);
}

/* ============================================================ K */
console.log("\n─── K. 交界面交线 ───");
{
  const [A, B] = reset([(x,y)=>700, (x,y)=>700 + (x-2000)*0.3]);
  check("相交的两个交界面产生交线", api.meshInter.length > 0, `${api.meshInter.length} 个交线网格`);
  let worst = 0, n = 0;
  for (const m of api.meshInter) {
    const P = m._pos;
    for (let k = 0; k < P.length; k += 18) {
      const x1 = (P[k]   + P[k+3]) /2, y1 = (P[k+1] + P[k+4]) /2;
      const x2 = (P[k+6] + P[k+15])/2, y2 = (P[k+7] + P[k+16])/2;
      for (const [x,y] of [[x1,y1],[x2,y2]]) {
        worst = Math.max(worst, Math.abs(evalSurf(A,x,y,M()).z - evalSurf(B,x,y,M()).z));
        n++;
      }
    }
  }
  check("窄带中心线落在真交线上（两界面高程相等）", worst < 3,
        `${n} 点，最大偏差 ${worst.toFixed(3)} m`);
  reset([(x,y)=>600, (x,y)=>1000]);
  check("不相交的两个交界面没有交线", api.meshInter.length === 0);
}

/* ============================================================ L */
console.log("\n─── L. 地层柱顺序（下老上新）───");
{
  reset([(x,y)=>300, (x,y)=>600, (x,y)=>900]);
  api.buildStratumList();
  check("地层自下而上编号连续",
        S.strata.every((st,k) => st.name === ('地层 '+(k+1))),
        S.strata.map(s=>s.name).join(' → '));
  check("交界面自下而上编号连续",
        S.ifaces.every((I,k) => I.name === ('交界面 '+(k+1))),
        S.ifaces.map(I=>I.name).join(' → '));
  check("最上面那个交界面就是地表",
        api.topIface() === S.ifaces[S.ifaces.length-1]);
  const mz = S.ifaces.map(I => I.Z.reduce((a,b)=>a+b,0)/SZ);
  check("界面平均高程自下而上递增（地层柱顺序正确）",
        mz.every((v,k) => k===0 || v > mz[k-1]),
        mz.map(v=>Math.round(v)).join(' < '));
}

/* ============================================================ M */
console.log("\n─── M. Shift 多选 + 整组升降 ───");
{
  const [, I] = reset([(x,y)=>600, (x,y)=>900]);
  S.active = 1;
  const cvEl = reg['gl'], N = S.res;
  const MVP = api.camMVP();
  const s00 = api.project(api.activeCtrl(0,0), MVP);
  const s88 = api.project(api.activeCtrl(8,8), MVP);
  const i00 = 0, i88 = 8*N+8;

  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:s00[0], clientY:s00[1], shiftKey:true });
  winEl.dispatchEvent({ type:'mouseup' });
  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:s88[0], clientY:s88[1], shiftKey:true });
  winEl.dispatchEvent({ type:'mouseup' });
  check("Shift 点击可累加选择控制点", api.selSet.size === 2, `选中 ${api.selSet.size} 个`);

  const z0 = I.z[i00], z8 = I.z[i88], zMid = I.z[4*N+4];
  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:s88[0], clientY:s88[1], shiftKey:false });
  winEl.dispatchEvent({ type:'mousemove', clientX:s88[0], clientY:s88[1]-40 });
  winEl.dispatchEvent({ type:'mouseup' });
  const d0 = I.z[i00]-z0, d8 = I.z[i88]-z8;
  check("整组一起动：两个选中点位移完全相同", Math.abs(d0-d8) < 1e-3, `Δ=${d0.toFixed(1)} / ${d8.toFixed(1)} m`);
  check("上拖 → 一起升高", d0 > 0 && d8 > 0, `Δ=${d0.toFixed(1)} m`);
  check("未选中的控制点纹丝不动", Math.abs(I.z[4*N+4]-zMid) < 1e-6);
}

/* ============================================================ N */
console.log("\n─── N. 空格 = 整个交界面上下平移 ───");
{
  const [, I] = reset([(x,y)=>600, (x,y)=>600 + 0.2*Math.abs(x-2000)]);
  S.active = 1;
  const before = Array.from(I.z);
  const cvEl = reg['gl'];
  winEl.dispatchEvent({ type:'keydown', code:'Space', preventDefault(){} });
  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:500, clientY:400 });
  winEl.dispatchEvent({ type:'mousemove', clientX:500, clientY:360 });
  winEl.dispatchEvent({ type:'mouseup' });
  winEl.dispatchEvent({ type:'keyup', code:'Space' });

  const d = before.map((v,k) => I.z[k]-v);
  check("所有控制点位移完全相同（刚体升降）", d.every(v => Math.abs(v-d[0]) < 1e-3), `Δ=${d[0].toFixed(1)} m`);
  check("上拖 → 整体升高", d[0] > 0, `Δ=${d[0].toFixed(1)} m`);
  check("面形不变（只是整体平移）",
        before.every((v,k) => Math.abs((I.z[k]-d[0]) - v) < 1e-3));

  const s44 = api.project(api.activeCtrl(4,4), api.camMVP());
  const snap2 = Array.from(I.z);
  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:s44[0], clientY:s44[1] });
  winEl.dispatchEvent({ type:'mousemove', clientX:s44[0], clientY:s44[1]-40 });
  winEl.dispatchEvent({ type:'mouseup' });
  let moved = 0;
  for (let k=0;k<I.z.length;k++) if (Math.abs(I.z[k]-snap2[k]) > 1e-6) moved++;
  check("松开空格后恢复单点编辑（只有命中的那一个点动）", moved === 1, `${moved} 个点被改动`);
}

/* ============================================================ O */
console.log("\n─── O. 保存 / 打开 往返一致 ───");
{
  reset([(x,y)=>300, (x,y)=>600, (x,y)=>900]);
  S.strata[0].color = [200,120,90]; S.strata[0].alpha = 0.4;
  S.strata[1].vis = false;
  S.surf = 'approx'; S.orderRule = false;
  S.interColor = [0.1, 0.9, 0.4]; S.interAlpha = 0.35;
  S.contourInt = 250; S.contourColor = [0.7, 0.2, 0.6]; S.contourAlpha = 0.45;
  S.showContour = false; S.contourLabel = false;
  S.mapMode = 'gray'; S.mapContour = false; S.mapInter = false;
  api.rebuild(false); api.render();
  const before = JSON.stringify(api.snapshot());

  S.res = 5; S.ifaces = []; S.strata = [];
  api.loadText(before);
  const after = JSON.stringify(api.snapshot());
  check("保存→打开后状态逐字节一致", before === after,
        before === after ? `${S.ifaces.length} 交界面 / ${S.strata.length} 地层` : '往返不一致');
  check("分辨率、曲面类型、次序规则开关一并恢复",
        S.res === 9 && S.surf === 'approx' && S.orderRule === false, `${S.res} / ${S.surf}`);
  check("颜色 / 透明度 / 显隐都恢复",
        S.strata[0].color.join() === '200,120,90' &&
        Math.abs(S.strata[0].alpha-0.4) < 1e-6 && S.strata[1].vis === false);
  check("拒绝打开非本程序的文件",
        (() => { try { api.loadText('{"format":"other"}'); return false; }
                 catch (e) { return true; } })());
  check("拒绝交界面数据长度与分辨率不符的文件",
        (() => { try {
          api.loadText(JSON.stringify({ format:'strata-editor', res:9,
            ifaces:[{name:'a',z:[1,2,3]},{name:'b',z:[1,2,3]}], strata:[{name:'x'}] }));
          return false; } catch (e) { return true; } })());
  check("拒绝地层数与交界面数对不上的文件",
        (() => { try {
          const z = new Array(81).fill(1);
          api.loadText(JSON.stringify({ format:'strata-editor', res:9,
            ifaces:[{name:'a',z},{name:'b',z},{name:'c',z}], strata:[{name:'x'}] }));
          return false; } catch (e) { return true; } })());

  const old = { format:'outcrop-skeleton', res:9,
    layers:[{name:'下',order:1,z:new Array(81).fill(400)},
            {name:'上',order:2,z:new Array(81).fill(800)}] };
  let migrated = true;
  try { api.loadText(JSON.stringify(old)); } catch (e) { migrated = false; }
  check("旧版存档（只有层面）能转成交界面打开", migrated &&
        S.ifaces.length === 2 && S.strata.length === 1,
        migrated ? `${S.ifaces.length} 交界面 / ${S.strata.length} 地层` : '抛异常了');
}

/* ============================================================ Q */
console.log("\n─── Q. 地表等高线（构造等高线）───");
{
  const [, top] = reset([(x,y)=>200, (x,y)=>620 + 0.2*x]);
  S.contourInt = 100; S.showContour = true;
  api.rebuild(false);
  check("等高线条数 = 高程范围内按等高距取的整倍数个数",
        api.contours.levels === 8, `实测 ${api.contours.levels} 条`);
  check("等高线画在地表（最上面的交界面）上", api.contours.name === top.name);
  check("等高线几何已生成", api.meshContour.length > 0, `${api.contours.segs} 段`);

  let worst = 0, tested = 0;
  for (const lv of [700, 900, 1100, 1300]) {
    const F = new Float32Array(SZ);
    for (let q=0;q<SZ;q++) F[q] = top.Z[q] - lv;
    for (const P of api.stitchContours(F))
      for (const [x,y] of P) {
        worst = Math.max(worst, Math.abs(evalSurf(top, x, y, M()).z - lv));
        tested++;
      }
  }
  check("等高线上每点的高程 = 该条的标注高度", worst < 1.0,
        `${tested} 点，最大偏差 ${worst.toFixed(4)} m`);

  S.contourInt = 250; api.rebuild(false);
  check("改等高距后条数随之变化", api.contours.levels === 3,
        `等高距 250 m → ${api.contours.levels} 条`);
  S.showContour = false; api.rebuild(false);
  check("关闭后不生成等高线几何", api.meshContour.length === 0);
  S.showContour = true;
}

/* ============================================================ T */
console.log("\n─── T. 等高线高程标注（断线 + 沿线方向 + 自动避让）───");
{
  const [, top] = reset([(x,y)=>200, (x,y)=>620 + 0.2*x]);
  S.contourInt = 100; S.showContour = true; S.contourLabel = true;
  api.rebuild(false);
  const A = api.anchors;
  check("生成了标注锚点", A.length > 0, `${A.length} 个 / ${api.contours.levels} 条等高线`);

  let worst = 0;
  for (const a of A) worst = Math.max(worst, Math.abs(evalSurf(top, a.x, a.y, M()).z - a.v));
  check("锚点落在它标注的那条等高线上", worst < 1.0, `最大偏差 ${worst.toFixed(4)} m`);

  let minD = Infinity;
  for (let i=0;i<A.length;i++) for (let j=i+1;j<A.length;j++)
    minD = Math.min(minD, Math.hypot(A[i].x-A[j].x, A[i].y-A[j].y));
  const sep = api.mapL()*0.16;
  check("标注之间互不挤在一起（最小间距约束生效）",
        A.length < 2 || minD >= sep - 1e-9, `最小间距 ${minD.toFixed(0)} m ≥ 设定 ${sep.toFixed(0)} m`);

  check("每个标注都带沿线的【单位】方向向量",
        A.every(a => Math.abs(Math.hypot(a.dx,a.dy,a.dz) - 1) < 1e-6));
  check("方向确实沿等高线方向（沿线走高程不变）",
        A.every(a => Math.abs(evalSurf(top, a.x + a.dx*40, a.y + a.dy*40, M()).z - a.v) < 1.0));

  check("等高线在标注处断开（数字嵌在缺口里）",
        api.contours.cut > 0, `断开 ${api.contours.cut} 段`);
  S.contourLabel = false; api.rebuild(false);
  check("关闭标注后不断线、无锚点",
        api.contours.cut === 0 && api.anchors.length === 0);
  S.contourLabel = true; api.rebuild(false);

  api.render();
  const spans = reg['labels'].children.filter(sp => sp.style.display !== 'none');
  check("3D 标注写出了高程数字",
        spans.length > 0 && spans.every(sp => /^\d+$/.test(sp.textContent)),
        spans.length ? `例如「${spans[0].textContent}」` : '');
  check("3D 标注带沿线方向的旋转",
        spans.length > 0 && spans.every(sp => /rotate\(-?[\d.]+deg\)/.test(sp.style.transform)));
}

/* ============================================================ T2 */
console.log("\n─── T2. 缺口必须是沿线胶囊，且不能横切邻近等高线 ───");
{
  reset([(x,y)=>200, (x,y)=>620 + 0.2*x]);
  S.contourInt = 20; S.showContour = true; S.contourLabel = true;
  api.rebuild(false);
  const ci = api.contours;
  check("构造出稠密等高线场景", ci.levels >= 20, `${ci.levels} 条，相邻间距 100 m`);

  const labLevels = new Set(api.anchors.map(a => a.v));
  let crossCut = 0;
  for (const [lv] of ci.cutByLevel) if (!labLevels.has(lv)) crossCut++;
  check("没有被【别的层】的数字切断的等高线", crossCut === 0,
        `被切的 ${ci.cutByLevel.size} 条全部有标注（有标注的共 ${labLevels.size} 条）`);

  const perLabel = ci.cut / Math.max(1, api.anchors.length);
  check("每个数字只吃掉本线上一小段（不是一大片圆）", perLabel < 15,
        `平均每个数字切断 ${perLabel.toFixed(1)} 段`);

  const maxHalfW = Math.max(...api.anchors.map(a => a.halfW));
  check("缺口垂直半宽远小于等高线间距（碰不到邻线）",
        maxHalfW * 2 < 100, `缺口宽 ${(maxHalfW*2).toFixed(0)} m ≪ 线距 100 m`);
  const ratios = api.anchors.map(a => a.half / a.halfW);
  check("缺口沿等高线方向拉长（不是各向同性的圆）",
        Math.min(...ratios) > 2, `长宽比最小 ${Math.min(...ratios).toFixed(1)}`);

  check("数字不再有白色描边", !/strokeText/.test(scriptSrc), '');
  const css = html.match(/#labels span\s*\{[^}]*\}/);
  check("3D 标注不再有白色底框", !!css && !/background/.test(css[0]));
}

/* ============================================================ R */
console.log("\n─── R. 交线窄带必须骑在两界面之上 ───");
{
  const [A, B] = reset([(x,y)=>800 + (x-2000)*0.28, (x,y)=>800 - (x-2000)*0.28]);
  api.rebuild(false);
  check("两界面相交生成了交线", api.meshInter.length > 0, `${api.meshInter.length} 个网格`);
  let below = 0, worst = 0, n = 0, maxUp = 0;
  for (const m of api.meshInter) {
    for (let k=0;k<m._pos.length;k+=3) {
      const x=m._pos[k], y=m._pos[k+1], z=m._pos[k+2];
      const za = api.sampleSurface(A.Z, x, y), zb = api.sampleSurface(B.Z, x, y);
      const d = z - Math.max(za, zb);
      if (d < -1e-6) { below++; worst = Math.min(worst, d); }
      maxUp = Math.max(maxUp, d);
      n++;
    }
  }
  check("每个顶点都不低于两个界面（否则会被深度测试切出透明缺口）",
        below === 0, `${n} 个顶点，沉面 ${below} 个` + (below ? `，最深 ${worst.toFixed(2)} m` : ''));
  check("抬升量受控，不会浮成一条悬空的线", maxUp < 4.0, `最大抬升 ${maxUp.toFixed(2)} m`);
}

/* ============================================================ V */
console.log("\n─── V. 交线窄带必须是【连续条带】───");
{
  reset([(x,y)=>800 + 60*Math.sin(x/500) + 40*Math.cos(y/430),
         (x,y)=>800 - 60*Math.sin(x/500) - 40*Math.cos(y/430)]);
  api.rebuild(false);
  check("生成了交线几何", api.meshInter.length > 0);
  let joints = 0, joined = 0;
  for (const m of api.meshInter) {
    const P = m._pos, quads = P.length / 18;
    for (let k = 0; k + 1 < quads; k++) {
      const o = k*18, o2 = (k+1)*18;
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

/* ============================================================ S */
console.log("\n─── S. 右侧平面图 ───");
{
  const [, top] = reset([(x,y)=>500, (x,y)=>1000 + 0.1*x]);
  api.rebuild(false);
  check("平面图取地表面", api.mapState.name === top.name, `画的是「${api.mapState.name}」`);
  check("平面图高程范围与地表一致",
        Math.abs(api.mapState.lo - 1000) < 1 && Math.abs(api.mapState.hi - 1400) < 1,
        `${api.mapState.lo.toFixed(0)} ~ ${api.mapState.hi.toFixed(0)} m`);
  let ok = true;
  for (const mode of ['gray', 'user', 'color']) {
    try { S.mapMode = mode; api.drawMap(); } catch (e) { ok = false; }
  }
  check("彩色 / 黑白 / 地层色 三种模式都能正常出图", ok);
  S.mapMode = 'color';
  try { S.mapContour = false; api.drawMap(); S.mapContour = true; api.drawMap(); }
  catch (e) { ok = false; }
  check("等高线开关都能正常出图", ok);

  reset([(x,y)=>700, (x,y)=>700 + (x-2000)*0.3]);
  S.mapInter = true; api.rebuild(false);
  check("相交的两个界面在平面图上画出交线", api.mapInterSegs > 0, `${api.mapInterSegs} 段`);
  S.mapInter = false; api.rebuild(false);
  check("关掉「显示交线」后平面图不再画", api.mapInterSegs === 0);
  S.mapInter = true;
}

/* ============================================================ P */
console.log("\n─── P. 深度遮挡状态 ───");
{
  reset([(x,y)=>700, (x,y)=>700 + (x-2000)*0.3]);
  draws.length = 0;
  api.render();
  const TRI = GLC.TRIANGLES, PTS = GLC.POINTS;
  const strataCounts = api.meshStrata.filter(Boolean).map(m => m.n);
  const surfDraws = draws.filter(d => d.mode===TRI && strataCounts.includes(d.count));
  check("地层绘制时深度测试开启", surfDraws.length > 0 && surfDraws.every(d => d.dt === true),
        `${surfDraws.length} 次`);
  check("地层绘制时写深度", surfDraws.length > 0 && surfDraws.every(d => d.dm === true));

  const interCounts = api.meshInter.map(m => m.n);
  const interDraws = draws.filter(d => d.mode===TRI && interCounts.includes(d.count));
  check("交线是在【深度测试开启】时绘制的", interDraws.length > 0 && interDraws.every(d => d.dt === true));
  check("交线写深度，能被更近的地层挡住", interDraws.every(d => d.dm === true));

  const ptDraws = draws.filter(d => d.mode===PTS);
  check("控制点手柄仍然穿透可见（便于编辑）",
        ptDraws.length > 0 && ptDraws.every(d => d.dt === false));

  const contourCounts = api.meshContour.map(m => m.n);
  const cDraws = draws.filter(d => d.mode===TRI && contourCounts.includes(d.count));
  check("等高线同样在深度测试开启时绘制", cDraws.length > 0 && cDraws.every(d => d.dt === true));

  check("交线顶点色为白，颜色完全由 uniform 控制",
        api.meshInter.every(m => {
          for (let i=0;i<m._col.length;i+=4)
            if (m._col[i]!==1 || m._col[i+1]!==1 || m._col[i+2]!==1) return false;
          return true;
        }));
}

/* ============================================================ W */
console.log("\n─── W. 拖动灵敏度 ───");
{
  const [I] = reset([(x,y)=>600]);
  S.active = 0; S.dragSens = 0.3;
  api.rebuild(true);
  const cvH = reg['gl'].clientHeight;
  const mpp = api.worldPerPixel();
  check("每像素对应的米数在合理范围", mpp > 0.3 && mpp < 4, `当前 ${mpp.toFixed(2)} m/px`);
  check("拖满整个画布高度也远不到 3000 m", mpp * cvH < 2500,
        `画布高 ${cvH} px = ${(mpp*cvH).toFixed(0)} m`);

  const s44 = api.project(api.activeCtrl(4,4), api.camMVP());
  const z0 = I.z[4*S.res+4];
  const cvEl = reg['gl'];
  cvEl.dispatchEvent({ type:'mousedown', button:0, clientX:s44[0], clientY:s44[1] });
  winEl.dispatchEvent({ type:'mousemove', clientX:s44[0], clientY:s44[1]-100 });
  winEl.dispatchEvent({ type:'mouseup' });
  const dz = I.z[4*S.res+4] - z0;
  check("上拖 100 px 的升降量与标称一致",
        Math.abs(dz - 100*mpp) < 0.01*Math.abs(100*mpp) + 1e-6,
        `实际 ${dz.toFixed(1)} m，标称 ${(100*mpp).toFixed(1)} m`);
  S.dragSens = 1.0;
  check("灵敏度可调，每像素米数按比例变化",
        Math.abs(api.worldPerPixel()/mpp - 1/0.3) < 1e-6, `1.0 → ${api.worldPerPixel().toFixed(2)} m/px`);
  S.dragSens = 0.3;
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`);
process.exit(fail ? 1 : 0);
