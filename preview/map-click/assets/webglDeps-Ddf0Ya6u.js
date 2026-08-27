import{o as h}from"./BufferObject-CzRwM4CM.js";import{m as y,s as _}from"./FramebufferObject-BOw-FY7e.js";import{s as c}from"./ProgramTemplate-lA3Eg0tc.js";import{e as j,a as F}from"./ProgramTemplate-lA3Eg0tc.js";import"./index-CRzb-W8M.js";import{A as v}from"./Texture-E_k1AGuI.js";import{h as P}from"./VertexArrayObject-C14vxSiv.js";class l{constructor(e){this._rctx=e,this._store=new Map}dispose(){this._store.forEach(e=>e.dispose()),this._store.clear()}acquire(e,r,t,s){const n=e+r+JSON.stringify(Array.from(t.entries())),o=this._store.get(n);if(o!=null)return o.ref(),o;const i=new c(this._rctx,e,r,t,s);return i.ref(),this._store.set(n,i),i}get test(){}}function p(f){const{options:e,value:r}=f;return typeof e[r]=="number"}function d(f){let e="";for(const r in f){const t=f[r];if(typeof t=="boolean")t&&(e+=`#define ${r}
`);else if(typeof t=="number")e+=`#define ${r} ${t.toFixed()}
`;else if(typeof t=="object")if(p(t)){const{value:s,options:n,namespace:o}=t,i=o?`${o}_`:"";for(const a in n)e+=`#define ${i}${a} ${n[a].toFixed()}
`;e+=`#define ${r} ${i}${s}
`}else{const s=t.options;let n=0;for(const o in s)e+=`#define ${s[o]} ${(n++).toFixed()}
`;e+=`#define ${r} ${s[t.value]}
`}}return e}export{h as BufferObject,y as FramebufferObject,c as Program,l as ProgramCache,_ as Renderbuffer,j as ShaderCompiler,v as Texture,P as VertexArrayObject,F as createProgram,d as glslifyDefineMap};
