#pragma once
#include <atomic>
#include <functional>
#include <string>
#include <thread>
namespace LicenseSdk {
// 独立心跳线程，UI 线程只接收状态回调。
class HeartbeatService { public: using Request=std::function<std::string()>; using Callback=std::function<void(const std::string&)>; HeartbeatService()=default; ~HeartbeatService(){stop();} void start(Request request, Callback cb){stop();running_=true;thread_=std::thread([this,request,cb]{while(running_){std::this_thread::sleep_for(std::chrono::seconds(5));if(!running_)break;try{std::string result=request?request():"heartbeat_request_missing";if(cb)cb(result);}catch(const std::exception& ex){if(cb)cb(std::string("heartbeat_error:")+ex.what());}}});} void stop(){running_=false;if(thread_.joinable())thread_.join();} private: std::atomic_bool running_{false}; std::thread thread_; };
}
