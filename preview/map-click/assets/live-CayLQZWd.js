import{U as s,V as T,bS as t,bT as n,J as a}from"./index-DjVYBSo6.js";import{r as l,p}from"./directive-helpers-CJmoa7PG.js";/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const f=s(class extends T{constructor(e){if(super(e),e.type!==t.PROPERTY&&e.type!==t.ATTRIBUTE&&e.type!==t.BOOLEAN_ATTRIBUTE)throw Error("The `live` directive is not allowed on child or event bindings");if(!l(e))throw Error("`live` bindings can only contain a single expression")}render(e){return e}update(e,[r]){if(r===n||r===a)return r;const i=e.element,o=e.name;if(e.type===t.PROPERTY){if(r===i[o])return n}else if(e.type===t.BOOLEAN_ATTRIBUTE){if(!!r===i.hasAttribute(o))return n}else if(e.type===t.ATTRIBUTE&&i.getAttribute(o)===r+"")return n;return p(e),r}});export{f as l};
