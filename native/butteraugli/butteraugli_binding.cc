// 纯 N-API 绑定：将 Google 官方 Butteraugli（butteraugli.cc）暴露给 Node。
// 仅依赖 Node 自带的 node_api.h，不需 node-addon-api。
// 用法：butteraugliDistance(rgba1, w1, h1, rgba2, w2, h2) -> number
//   - rgba 为 RGBA8 的 Node Buffer（sharp 的 raw().toBuffer() 产物），4 字节/像素。
//   - 输入按 google/butteraugli 官方语义做 sRGB->线性（背景黑合成 alpha），
//     再调用 ButteraugliInterface(..., hf_asymmetry=1.0, ...) 返回权威距离（越小越好）。
//   - 尺寸不一致或解码失败返回 NaN，由上层回退到近似实现。
#include <node_api.h>
#include <cmath>
#include <vector>

#include "butteraugli.h"

// node-addon-api 提供的便捷宏，纯 N-API 下自行定义（遇错误直接抛 JS 异常）。
#define NAPI_CALL(env, call)                                             \
  do {                                                                   \
    napi_status _status = (call);                                        \
    if (_status != napi_ok) {                                            \
      const napi_extended_error_info* _err = nullptr;                     \
      napi_get_last_error_info((env), &_err);                            \
      bool _pending = false;                                             \
      napi_is_exception_pending((env), &_pending);                       \
      if (!_pending) {                                                   \
        const char* _msg = (_err->error_message == nullptr)              \
                               ? "napi error"                            \
                               : _err->error_message;                   \
        napi_throw_error((env), nullptr, _msg);                          \
      }                                                                  \
      return nullptr;                                                    \
    }                                                                    \
  } while (0)

static double SrgbToLinear(int v) {
  const double srgb = v / 255.0;
  return 255.0 * (srgb <= 0.04045 ? srgb / 12.92
                                    : std::pow((srgb + 0.055) / 1.055, 2.4));
}

static napi_value ButteraugliDistance(napi_env env, napi_callback_info info) {
  size_t argc = 6;
  napi_value args[6];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, args, nullptr, nullptr));

  void* d1 = nullptr;
  size_t l1 = 0;
  void* d2 = nullptr;
  size_t l2 = 0;
  uint32_t w1 = 0, h1 = 0, w2 = 0, h2 = 0;

  NAPI_CALL(env, napi_get_buffer_info(env, args[0], &d1, &l1));
  NAPI_CALL(env, napi_get_value_uint32(env, args[1], &w1));
  NAPI_CALL(env, napi_get_value_uint32(env, args[2], &h1));
  NAPI_CALL(env, napi_get_buffer_info(env, args[3], &d2, &l2));
  NAPI_CALL(env, napi_get_value_uint32(env, args[4], &w2));
  NAPI_CALL(env, napi_get_value_uint32(env, args[5], &h2));

  double ret = NAN;
  if (w1 == w2 && h1 == h2) {
    const size_t need = static_cast<size_t>(w1) * h1 * 4;
    if (l1 >= need && l2 >= need) {
      const uint8_t* p1 = static_cast<const uint8_t*>(d1);
      const uint8_t* p2 = static_cast<const uint8_t*>(d2);

      std::vector<butteraugli::ImageF> rgb0(3), rgb1(3);
      for (int c = 0; c < 3; ++c) {
        rgb0[c] = butteraugli::ImageF(w1, h1);
        rgb1[c] = butteraugli::ImageF(w1, h1);
      }
      for (int y = 0; y < static_cast<int>(h1); ++y) {
        for (int x = 0; x < static_cast<int>(w1); ++x) {
          const size_t i = (static_cast<size_t>(y) * w1 + x) * 4;
          for (int c = 0; c < 3; ++c) {
            const int v1 = p1[i + c], a1 = p1[i + 3];
            const int v2 = p2[i + c], a2 = p2[i + 3];
            rgb0[c].Row(y)[x] =
                static_cast<float>(SrgbToLinear(v1) * (a1 / 255.0));
            rgb1[c].Row(y)[x] =
                static_cast<float>(SrgbToLinear(v2) * (a2 / 255.0));
          }
        }
      }
      butteraugli::ImageF diffmap;
      double dv = 0.0;
      if (butteraugli::ButteraugliInterface(rgb0, rgb1, 1.0f, diffmap, dv)) {
        ret = dv;
      }
    }
  }

  napi_value result;
  NAPI_CALL(env, napi_create_double(env, ret, &result));
  return result;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  NAPI_CALL(env, napi_create_function(env, nullptr, 0, ButteraugliDistance,
                                      nullptr, &fn));
  NAPI_CALL(env, napi_set_named_property(env, exports, "butteraugliDistance",
                                         fn));
  return exports;
}

NAPI_MODULE(butteraugli, Init)
