import{h,i as r}from"./index-D2B_S-qX.js";/*! All material copyright ESRI, All Rights Reserved, unless otherwise specified.
See https://github.com/Esri/calcite-design-system/blob/dev/LICENSE.md for details.
v3.3.3 */const i={textMatch:"text-match"};function e({text:a,pattern:s}){if(!s||!a)return a;const t=a.split(s);return t.length>1&&(t[1]=r`<mark class=${h(i.textMatch)}>${t[1]}</mark>`),t}export{e as h};
