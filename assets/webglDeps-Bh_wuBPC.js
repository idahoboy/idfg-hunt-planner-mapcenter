import{o as $}from"./BufferObject-DPxBHT1z.js";import{m as b,s as y}from"./FramebufferObject-vThmLIWt.js";import{s as c}from"./ProgramTemplate-BVKCohIv.js";import{e as g,a as j}from"./ProgramTemplate-BVKCohIv.js";import{cP as O}from"./index-9_ETgfbS.js";import{h as v}from"./VertexArrayObject-Dav3ezHs.js";class m{constructor(e){this._rctx=e,this._store=new Map}dispose(){this._store.forEach(e=>e.dispose()),this._store.clear()}acquire(e,r,t,s){const n=e+r+JSON.stringify(Array.from(t.entries())),o=this._store.get(n);if(o!=null)return o.ref(),o;const i=new c(this._rctx,e,r,t,s);return i.ref(),this._store.set(n,i),i}get test(){}}function p(f){const{options:e,value:r}=f;return typeof e[r]=="number"}function l(f){let e="";for(const r in f){const t=f[r];if(typeof t=="boolean")t&&(e+=`#define ${r}
`);else if(typeof t=="number")e+=`#define ${r} ${t.toFixed()}
`;else if(typeof t=="object")if(p(t)){const{value:s,options:n,namespace:o}=t,i=o?`${o}_`:"";for(const a in n)e+=`#define ${i}${a} ${n[a].toFixed()}
`;e+=`#define ${r} ${i}${s}
`}else{const s=t.options;let n=0;for(const o in s)e+=`#define ${s[o]} ${(n++).toFixed()}
`;e+=`#define ${r} ${s[t.value]}
`}}return e}export{$ as BufferObject,b as FramebufferObject,c as Program,m as ProgramCache,y as Renderbuffer,g as ShaderCompiler,O as Texture,v as VertexArrayObject,j as createProgram,l as glslifyDefineMap};
