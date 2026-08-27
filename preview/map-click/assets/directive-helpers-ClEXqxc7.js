import{co as d}from"./index-fv5S10-P.js";/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{I:m}=d,s=t=>t,p=t=>t.strings===void 0,c=()=>document.createComment(""),B=(t,i,A)=>{const $=t._$AA.parentNode,e=i===void 0?t._$AB:i._$AA;if(A===void 0){const r=$.insertBefore(c(),e),_=$.insertBefore(c(),e);A=new m(r,_,t,t.options)}else{const r=A._$AB.nextSibling,_=A._$AM,o=_!==t;if(o){let n;A._$AQ?.(t),A._$AM=t,A._$AP!==void 0&&(n=t._$AU)!==_._$AU&&A._$AP(n)}if(r!==e||o){let n=A._$AA;for(;n!==r;){const f=s(n).nextSibling;s($).insertBefore(n,e),n=f}}}return A},a=(t,i,A=t)=>(t._$AI(i,A),t),l={},g=(t,i=l)=>t._$AH=i,u=t=>t._$AH,x=t=>{t._$AR(),t._$AA.remove()};export{u as M,x as h,g as p,p as r,a as u,B as v};
