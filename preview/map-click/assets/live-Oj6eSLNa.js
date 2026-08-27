import{cr as o,cs as T,g1 as t,g2 as n,cp as p}from"./index-fv5S10-P.js";import{r as a,p as l}from"./directive-helpers-ClEXqxc7.js";/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const E=o(class extends T{constructor(e){if(super(e),e.type!==t.PROPERTY&&e.type!==t.ATTRIBUTE&&e.type!==t.BOOLEAN_ATTRIBUTE)throw Error("The `live` directive is not allowed on child or event bindings");if(!a(e))throw Error("`live` bindings can only contain a single expression")}render(e){return e}update(e,[r]){if(r===n||r===p)return r;const s=e.element,i=e.name;if(e.type===t.PROPERTY){if(r===s[i])return n}else if(e.type===t.BOOLEAN_ATTRIBUTE){if(!!r===s.hasAttribute(i))return n}else if(e.type===t.ATTRIBUTE&&s.getAttribute(i)===r+"")return n;return l(e),r}});export{E as l};
