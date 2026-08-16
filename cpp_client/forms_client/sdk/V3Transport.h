#pragma once
#include <string>
namespace LicenseSdk {
// v3 传输层：负责 LK3 请求封包、RSA-OAEP 密钥交换和 LR3 响应解密。
struct V3Response { int http_status{}; std::string body; std::string error; };
class V3Transport { public: explicit V3Transport(std::string host="127.0.0.1:8080"); V3Response post(const std::string& path,const std::string& json); private: std::string host_; };
}
