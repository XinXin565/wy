#pragma once
#include <string>
namespace LicenseSdk {
// v3 传输层：负责 LK3 请求封包、RSA-OAEP 密钥交换和 LR3 响应解密。
struct V3Response { int http_status{}; std::string body; std::string error; };
class V3Transport { public: explicit V3Transport(std::string host="127.0.0.1:8080"); V3Response post(const std::string& path,const std::string& json); private: std::string host_; };
// 云函数调用统一入口：function 仅允许服务端白名单方法名。
struct FunctionResult { bool ok{}; std::string function, result, error; };
class CloudFunctionClient { public: explicit CloudFunctionClient(V3Transport& transport):transport_(transport){} FunctionResult call(const std::string& function,const std::string& args_json); private: V3Transport& transport_; };
}
