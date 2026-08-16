#pragma once
#include <mutex>
#include <string>

namespace LicenseSdk {
// 登录成功后的授权上下文，云函数和心跳线程只读取此对象，不直接依赖窗口控件。
struct LicenseSessionData {
    std::string license_key;
    std::string product_code;
    std::string product_name;
    std::string device_id;
    std::string expires_at;
    bool authenticated = false;
};

class LicenseSession {
public:
    void set(LicenseSessionData value) { std::lock_guard<std::mutex> lock(mutex_); data_ = std::move(value); }
    LicenseSessionData get() const { std::lock_guard<std::mutex> lock(mutex_); return data_; }
    void clear() { std::lock_guard<std::mutex> lock(mutex_); data_ = {}; }
    bool authenticated() const { std::lock_guard<std::mutex> lock(mutex_); return data_.authenticated; }
private:
    mutable std::mutex mutex_;
    LicenseSessionData data_;
};
}
