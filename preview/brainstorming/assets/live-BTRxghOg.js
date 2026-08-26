import{H as s,J as T,bQ as t,bR as n,A as l}from"./index-DZh0gb46.js";import{r as p,p as a}from"./directive-helpers-CbXdNMpM.js";/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const f=s(class extends T{constructor(e){if(super(e),e.type!==t.PROPERTY&&e.type!==t.ATTRIBUTE&&e.type!==t.BOOLEAN_ATTRIBUTE)throw Error("The `live` directive is not allowed on child or event bindings");if(!p(e))throw Error("`live` bindings can only contain a single expression")}render(e){return e}update(e,[r]){if(r===n||r===l)return r;const i=e.element,o=e.name;if(e.type===t.PROPERTY){if(r===i[o])return n}else if(e.type===t.BOOLEAN_ATTRIBUTE){if(!!r===i.hasAttribute(o))return n}else if(e.type===t.ATTRIBUTE&&i.getAttribute(o)===r+"")return n;return a(e),r}});export{f as l};
