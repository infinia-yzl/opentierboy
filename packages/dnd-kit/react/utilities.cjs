'use strict';

// src/utilities/currentValue.ts
function isRef(value) {
  return value != null && typeof value === "object" && "current" in value;
}
function currentValue(value) {
  var _a;
  if (value == null) {
    return void 0;
  }
  if (isRef(value)) {
    return (_a = value.current) != null ? _a : void 0;
  }
  return value;
}

exports.currentValue = currentValue;
//# sourceMappingURL=utilities.cjs.map
//# sourceMappingURL=utilities.cjs.map