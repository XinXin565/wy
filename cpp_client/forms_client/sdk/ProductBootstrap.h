#pragma once
#include <string>
#include "V3Transport.h"
namespace LicenseSdk {
struct ProductConfig { bool ok{}; std::string name,announcement,latest_version,min_version,update_url,error; };
// 启动握手：产品不存在、停用或版本过低时返回 ok=false。
class ProductBootstrap { public: ProductBootstrap(V3Transport& transport,std::string code,std::string version); ProductConfig load(); private: V3Transport& transport_; std::string code_,version_; };
}
