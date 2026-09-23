"use strict";

// This token is intentionally public. Configure a Cesium ion token restricted
// to read-only access and the application's allowed URLs, never a secret key.
function buildMapConfig(env = {}) {
  const token = env?.CESIUM_ION_ACCESS_TOKEN;
  const ionAccessToken = typeof token === "string" && token.length <= 4096
    && !/[\u0000-\u001f\u007f-\u009f]/.test(token) ? token.trim() || null : null;
  return {
    provider: "cesium",
    ionAccessToken,
    enable3d: Boolean(ionAccessToken) && env?.CESIUM_ENABLE_3D === "true"
  };
}

module.exports = { buildMapConfig };
