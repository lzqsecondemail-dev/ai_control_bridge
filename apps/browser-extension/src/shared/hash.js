(function () {
  "use strict";

  function simpleHash(text) {
    var input = String(text || "");
    var hash = 2166136261;

    for (var i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  globalThis.AcbHash = {
    simpleHash: simpleHash
  };
})();
