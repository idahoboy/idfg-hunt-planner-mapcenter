import{e as d}from"./escapeRegExp-B07ahagJ.js";function p(e){return e}function y(e,f=p){if(e==null)return e;for(const t in e)if(f(e[t],t,e)===!1)break;return e}/*! All material copyright ESRI, All Rights Reserved, unless otherwise specified.
See https://github.com/Esri/calcite-design-system/blob/dev/LICENSE.md for details.
v3.3.3 */const h=(e,f,t)=>{const a=d(f),l=new RegExp(a,"i");e.length===0&&console.warn(`No data was passed to the filter function.
    The data argument should be an array of objects`);const s=(n,o,u)=>{if(n?.constant||n?.filterDisabled)return!0;let i=!1;return y(n,(r,c)=>{typeof r=="function"||r==null||u&&!u.includes(c)||(Array.isArray(r)||typeof r=="object"&&r!==null?s(r,o)&&(i=!0):o.test(r)&&(i=!0))}),i};return e.filter(n=>s(n,l,t))};export{h as f};
