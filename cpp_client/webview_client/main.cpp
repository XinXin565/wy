#define UNICODE
#define _UNICODE
#include <windows.h>
#include <wrl.h>
#include <WebView2.h>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <string>
#include <thread>

// 复用示例 SDK 中的 v3 LK3/LR3 加密传输和设备唯一码实现。
#define wWinMain legacy_wWinMain
#include "../license_test.cpp"
#undef wWinMain

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace {
constexpr UINT WM_HEARTBEAT_RESULT = WM_APP + 20;
ComPtr<ICoreWebView2Controller> g_controller;
ComPtr<ICoreWebView2> g_webview;
HWND g_window{};
std::string g_license;
std::atomic_bool g_heartbeatRunning{false};
std::thread g_heartbeatThread;
std::mutex g_heartbeatMutex;
std::condition_variable g_heartbeatWake;
struct HeartbeatResult { bool ok; bool offline; std::wstring text; };

const wchar_t* kPageHtml = LR"HTML(
<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--ink:#173642;--muted:#647d86;--a:#087f91;--b:#18a394;--bad:#b63e4a}*{box-sizing:border-box;letter-spacing:0}html,body{height:100%;margin:0;overflow:hidden}body{font-family:"Segoe UI Variable","Microsoft YaHei UI",sans-serif;color:var(--ink);background:linear-gradient(145deg,#d9e9ed,#f1f4f5 50%,#dce7ec)}body:before{content:"";position:fixed;inset:-20%;background:radial-gradient(circle at 22% 18%,#18a39444,transparent 30%),radial-gradient(circle at 82% 76%,#087f9133,transparent 28%);filter:blur(24px);animation:drift 12s ease-in-out infinite alternate}.app{position:relative;display:grid;place-items:center;height:100%;padding:24px}.shell{width:min(680px,100%);min-height:500px;padding:29px;border:1px solid #ffffffdd;border-radius:22px;background:linear-gradient(145deg,#ffffffb8,#dfeff36b);box-shadow:inset 0 1px #fff,0 24px 68px #1e46542b;backdrop-filter:blur(30px) saturate(155%)}.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:21px}.brand{display:flex;align-items:center;gap:12px}.mark{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;color:white;font-weight:750;background:linear-gradient(135deg,var(--a),var(--b));box-shadow:0 10px 24px #087f9138}h1{margin:0;font-size:22px}.sub{margin-top:5px;color:var(--muted);font-size:12px}.product{padding:7px 11px;border:1px solid #087f9129;border-radius:9px;background:#ffffff66;color:var(--a);font-size:11px;font-weight:700}.notice,.hero,.item{border:1px solid #ffffffc2;background:#ffffff61}.notice{min-height:82px;padding:15px 17px;border-radius:14px;color:#3e616c;font-size:13px;line-height:1.65;white-space:pre-wrap}.label{display:block;margin:18px 0 8px;color:#4e6872;font-size:12px;font-weight:650}.input{width:100%;height:46px;padding:0 14px;border:1px solid #295b6c33;border-radius:10px;background:#ffffffb8;color:var(--ink);font:14px inherit;outline:none}.input:focus{border-color:#168fa4;box-shadow:0 0 0 4px #168fa41f}.primary{width:100%;margin-top:13px;background:linear-gradient(105deg,var(--a),var(--b));color:#fff;box-shadow:0 12px 24px #087f9133}button{height:44px;border:0;border-radius:10px;font:650 14px inherit;transition:.15s}button:active{transform:scale(.988)}button:disabled{opacity:.55}.status{min-height:20px;margin-top:11px;color:var(--muted);font-size:12px}.error{color:var(--bad)}.foot{margin-top:18px;color:#7b9098;font-size:11px;text-align:center}.hidden{display:none!important}.details{animation:in .25s ease}.hero{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-radius:14px}.online{display:flex;align-items:center;gap:12px}.dot{width:10px;height:10px;border-radius:50%;background:#13a780;box-shadow:0 0 0 6px #13a7801f;animation:pulse 2s infinite}.online strong,.online small{display:block}.online small{margin-top:3px;color:var(--muted)}.protocol{color:var(--a);font-size:11px;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.item{min-height:77px;padding:13px 15px;border-radius:12px}.wide{grid-column:1/-1}.item span{display:block;margin-bottom:6px;color:#71868e;font-size:11px}.item strong{display:block;font-size:13px;overflow-wrap:anywhere}.good{color:#087a65}.secondary{width:100%;margin-top:13px;border:1px solid #1f55652b;background:#ffffff7a;color:#315965}.modal{position:fixed;inset:0;display:grid;place-items:center;padding:24px;background:#3248502e;backdrop-filter:blur(8px)}.dialog{width:min(390px,100%);padding:24px;border:1px solid #fff;border-radius:17px;background:#f5fbfce8;box-shadow:0 22px 65px #193e4b3b;text-align:center;animation:in .2s ease}.icon{display:grid;place-items:center;width:44px;height:44px;margin:0 auto 13px;border-radius:50%;background:#def4ed;color:#087a65;font-size:24px}.dialog h2{margin:0 0 8px;font-size:18px}.dialog p{margin:0;color:#526d77;line-height:1.7;white-space:pre-wrap}.dialog button{width:100%;margin-top:18px;background:#173f4c;color:white}@keyframes in{from{opacity:0;transform:translateY(8px)}}@keyframes pulse{70%{box-shadow:0 0 0 11px #13a78000}}@keyframes drift{to{transform:translate(2%,-1%) scale(1.04)}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}@media(max-width:560px){.app{padding:14px}.shell{padding:20px;min-height:0}.grid{grid-template-columns:1fr}.wide{grid-column:auto}.product{display:none}}
</style></head><body><div class="app"><main class="shell"><div class="top"><div class="brand"><div class="mark">X</div><div><h1>产品授权</h1><div class="sub" id="version">正在读取产品配置...</div></div></div><div class="product">XinGodSKJH</div></div><section id="loginView"><div class="notice" id="notice">正在读取产品公告...</div><label class="label">卡密</label><input class="input" id="key" autocomplete="off" placeholder="请输入卡密"><button class="primary" id="login" onclick="login()">登录验证</button><div class="status" id="status"></div></section><section class="details hidden" id="details"><div class="hero"><div class="online"><i class="dot"></i><div><strong id="onlineTitle">授权在线</strong><small id="heartbeat">等待首次心跳</small></div></div><div class="protocol">v3 LK3/LR3</div></div><div class="grid"><div class="item"><span>产品</span><strong>XinGodSKJH（编号 1）</strong></div><div class="item"><span>到期时间</span><strong id="expires">-</strong></div><div class="item wide"><span>设备唯一码</span><strong id="device">-</strong></div><div class="item wide"><span>云函数</span><strong id="cloud">正在读取安全参数...</strong></div></div><button class="secondary" onclick="send('LOGOUT')">退出登录</button></section><div class="foot">v3 加密传输 · 独立线程 5 秒心跳 · WebView2</div></main></div><div class="modal hidden" id="modal"><div class="dialog"><div class="icon">✓</div><h2 id="modalTitle">登录成功</h2><p id="modalText"></p><button onclick="$('modal').classList.add('hidden')">进入授权详情</button></div></div>
<script>const $=id=>document.getElementById(id),send=x=>window.chrome.webview.postMessage(x);function show(t,c=''){const n=$('status');n.textContent=t;n.className='status '+c}function login(){const key=$('key').value.trim();if(!key)return show('请输入卡密','error');$('login').disabled=true;$('login').textContent='正在验证...';show('正在建立 v3 加密会话...');send('LOGIN:'+key)}function time(v){return v?v.replace('T',' ').replace(/(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/,'').slice(0,19):'永久'}$('key').onkeydown=e=>{if(e.key==='Enter')login()};window.chrome.webview.addEventListener('message',e=>{const d=e.data||{};if(d.type==='bootstrap'){$('notice').textContent=d.notice||'当前没有公告';$('version').textContent='最新版本：'+(d.latest||'-')+'  ·  本地版本：'+d.local;$('login').disabled=!d.ok;if(!d.ok)show(d.message,'error')}if(d.type==='login'){$('login').disabled=false;$('login').textContent='登录验证';if(!d.ok)return show(d.message,'error');$('expires').textContent=time(d.expires);$('device').textContent=d.device;$('loginView').classList.add('hidden');$('details').classList.remove('hidden');$('modalTitle').textContent='登录成功';$('modalText').textContent='到期时间：'+time(d.expires);$('modal').classList.remove('hidden')}if(d.type==='cloud'){$('cloud').textContent=d.message;$('cloud').className=d.ok?'good':'error'}if(d.type==='heartbeat'){$('heartbeat').textContent=d.message;if(d.offline){$('onlineTitle').textContent='授权已下线';document.querySelector('.dot').style.background='#b63e4a';$('modalTitle').textContent='授权已失效';$('modalText').textContent=d.message;$('modal').classList.remove('hidden')}}if(d.type==='logout'){$('details').classList.add('hidden');$('loginView').classList.remove('hidden');$('key').value='';show('已安全退出');$('login').disabled=false}});send('BOOTSTRAP');</script></body></html>)HTML";

std::wstring JsonEscape(const std::wstring& value) {
    std::wstring out;
    for (wchar_t c : value) {
        if (c == L'\\') out += L"\\\\";
        else if (c == L'"') out += L"\\\"";
        else if (c == L'\r') out += L"\\r";
        else if (c == L'\n') out += L"\\n";
        else if (c == L'\t') out += L"\\t";
        else out += c;
    }
    return out;
}

void SendJson(const std::wstring& json) { if (g_webview) g_webview->PostWebMessageAsJson(json.c_str()); }

// 旧 SDK 的 json_value 只截取字符串，这里补齐常用 JSON 转义，保证中文公告正常显示。
std::wstring JsonWideValue(const std::string& body, const std::string& key) {
    const std::string raw = json_value(body, key);
    std::wstring out;
    for (size_t i = 0; i < raw.size();) {
        if (raw[i] == '\\' && i + 1 < raw.size()) {
            const char escaped = raw[i + 1];
            if (escaped == 'u' && i + 5 < raw.size()) {
                wchar_t value = 0;
                bool valid = true;
                for (size_t j = i + 2; j < i + 6; ++j) {
                    const char c = raw[j];
                    int digit = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1;
                    if (digit < 0) { valid = false; break; }
                    value = static_cast<wchar_t>((value << 4) | digit);
                }
                if (valid) { out += value; i += 6; continue; }
            }
            if (escaped == 'n') out += L'\n';
            else if (escaped == 'r') out += L'\r';
            else if (escaped == 't') out += L'\t';
            else if (escaped == '"') out += L'"';
            else if (escaped == '\\') out += L'\\';
            else out += static_cast<wchar_t>(escaped);
            i += 2;
            continue;
        }
        const size_t start = i;
        while (i < raw.size() && raw[i] != '\\') ++i;
        out += utf8_to_wide(raw.substr(start, i - start));
    }
    return out;
}

std::wstring CloudErrorText(const std::string& body) {
    if (body.find("script_not_enabled") != std::string::npos) return L"云函数尚未启用";
    if (body.find("script_execution_failed") != std::string::npos) return L"云函数执行失败";
    if (body.find("device_not_bound") != std::string::npos) return L"设备授权已失效";
    if (body.find("product_name_mismatch") != std::string::npos) return L"客户端产品名称不匹配";
    if (body.find("product_not_found") != std::string::npos) return L"产品不存在或已停用";
    return L"云函数读取失败";
}

// 云函数请求也使用 v3 二进制信封，服务端会再次校验卡密、产品和设备状态。
Response SecureExecute(const std::string& license, const std::string& function) {
    const std::string path = "/api/v3/products/execute";
    auto key = random_bytes(32), iv = random_bytes(12), nonce = random_bytes(24);
    std::string plain = "{\"license_key\":\"" + json_escape(license) +
        "\",\"product_code\":\"" + PRODUCT_CODE +
        "\",\"product_name\":\"" + json_escape(PRODUCT_NAME) +
        "\",\"function\":\"" + json_escape(function) +
        "\",\"args\":{},\"device_id\":\"" + json_escape(device_code()) +
        "\",\"_path\":\"" + path +
        "\",\"_timestamp\":\"" + std::to_string(std::time(nullptr)) +
        "\",\"_nonce\":\"" + b64url(nonce) + "\"}";
    std::vector<BYTE> tag, bytes(plain.begin(), plain.end());
    auto cipher = aes_gcm(true, key, iv, "", bytes, tag), wrapped = rsa_oaep(key);
    std::string packet("LK3\0", 4);
    packet.append(reinterpret_cast<char*>(wrapped.data()), wrapped.size());
    packet.append(reinterpret_cast<char*>(iv.data()), iv.size());
    packet.append(reinterpret_cast<char*>(tag.data()), tag.size());
    packet.append(reinterpret_cast<char*>(cipher.data()), cipher.size());
    Response response = http_post(path, packet);
    if (response.body.size() < 32 || response.body.compare(0, 4, "LR3\0", 4) != 0) return response;
    std::vector<BYTE> rIv(response.body.begin()+4,response.body.begin()+16);
    std::vector<BYTE> rTag(response.body.begin()+16,response.body.begin()+32);
    std::vector<BYTE> rCipher(response.body.begin()+32,response.body.end());
    auto decoded = aes_gcm(false,key,rIv,"",rCipher,rTag);
    response.body.assign(decoded.begin(),decoded.end());
    return response;
}

void StopHeartbeat() {
    g_heartbeatRunning = false;
    g_heartbeatWake.notify_all();
    if (g_heartbeatThread.joinable()) g_heartbeatThread.join();
}

void StartHeartbeat() {
    StopHeartbeat();
    g_heartbeatRunning = true;
    g_heartbeatThread = std::thread([] {
        int failures = 0;
        while (g_heartbeatRunning) {
            std::unique_lock<std::mutex> lock(g_heartbeatMutex);
            if (g_heartbeatWake.wait_for(lock, std::chrono::seconds(5), [] { return !g_heartbeatRunning.load(); })) break;
            lock.unlock();
            try {
                Response response = secure_post("heartbeat", g_license);
                if (response.status == 200) {
                    failures = 0;
                    auto stamp = utf8_to_wide(json_value(response.body, "server_time"));
                    PostMessage(g_window, WM_HEARTBEAT_RESULT, 0, reinterpret_cast<LPARAM>(
                        new HeartbeatResult{true, false, stamp.empty() ? L"最近心跳正常" : L"最近心跳：" + stamp}));
                    continue;
                }
                PostMessage(g_window, WM_HEARTBEAT_RESULT, 0, reinterpret_cast<LPARAM>(
                    new HeartbeatResult{false, true, error_text(response.body, true)}));
                g_heartbeatRunning = false;
            } catch (...) {
                const bool offline = ++failures >= 3;
                PostMessage(g_window, WM_HEARTBEAT_RESULT, 0, reinterpret_cast<LPARAM>(new HeartbeatResult{
                    false, offline, offline ? L"网络连续异常，授权会话已下线" : L"心跳网络异常，5 秒后重试"}));
                if (offline) g_heartbeatRunning = false;
            }
        }
    });
}

void Logout(bool notifyPage) {
    StopHeartbeat();
    if (!g_license.empty()) { try { secure_post("logout", g_license); } catch (...) {} }
    g_license.clear();
    if (notifyPage) SendJson(L"{\"type\":\"logout\"}");
}

void HandleBootstrap() {
    try {
        Response response = secure_bootstrap();
        if (response.status != 200) {
            auto error = error_text(response.body, false);
            SendJson(L"{\"type\":\"bootstrap\",\"ok\":false,\"notice\":\"产品配置读取失败\",\"latest\":\"-\",\"local\":\"" + utf8_to_wide(CLIENT_VERSION) + L"\",\"message\":\"" + JsonEscape(error) + L"\"}");
            return;
        }
        auto notice = JsonWideValue(response.body,"content");
        auto latest = JsonWideValue(response.body,"version");
        SendJson(L"{\"type\":\"bootstrap\",\"ok\":true,\"notice\":\"" + JsonEscape(notice) + L"\",\"latest\":\"" + JsonEscape(latest) + L"\",\"local\":\"" + utf8_to_wide(CLIENT_VERSION) + L"\"}");
    } catch (...) {
        SendJson(L"{\"type\":\"bootstrap\",\"ok\":false,\"notice\":\"产品配置读取失败\",\"latest\":\"-\",\"local\":\"3.0.0\",\"message\":\"服务器连接异常\"}");
    }
}

void HandleLogin(const std::wstring& message) {
    try {
        std::string license = wide_to_utf8(message.substr(6));
        Response response = secure_post("activate", license);
        if (response.status != 200) {
            SendJson(L"{\"type\":\"login\",\"ok\":false,\"message\":\"" + JsonEscape(error_text(response.body,false)) + L"\"}");
            return;
        }
        g_license = license;
        auto expires = utf8_to_wide(json_value(response.body,"expires_at"));
        auto device = utf8_to_wide(device_code());
        SendJson(L"{\"type\":\"login\",\"ok\":true,\"expires\":\"" + JsonEscape(expires) + L"\",\"device\":\"" + JsonEscape(device) + L"\"}");
        StartHeartbeat();
        try {
            Response cloud = SecureExecute(g_license,"get_security_parameters");
            if (cloud.status == 200) {
                auto version = JsonWideValue(cloud.body,"script_version");
                SendJson(L"{\"type\":\"cloud\",\"ok\":true,\"message\":\"安全参数读取成功 · 脚本版本 " + JsonEscape(version) + L"\"}");
            } else {
                SendJson(L"{\"type\":\"cloud\",\"ok\":false,\"message\":\"" + JsonEscape(CloudErrorText(cloud.body)) + L"\"}");
            }
        } catch (...) {
            SendJson(L"{\"type\":\"cloud\",\"ok\":false,\"message\":\"云函数网络请求失败\"}");
        }
    } catch (...) {
        SendJson(L"{\"type\":\"login\",\"ok\":false,\"message\":\"网络连接失败\"}");
    }
}

LRESULT CALLBACK AppWndProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    if (message == WM_SIZE && g_controller) { RECT bounds{}; GetClientRect(window,&bounds); g_controller->put_Bounds(bounds); return 0; }
    if (message == WM_HEARTBEAT_RESULT) {
        auto* result = reinterpret_cast<HeartbeatResult*>(lParam);
        SendJson(L"{\"type\":\"heartbeat\",\"ok\":" + std::wstring(result->ok?L"true":L"false") + L",\"offline\":" + std::wstring(result->offline?L"true":L"false") + L",\"message\":\"" + JsonEscape(result->text) + L"\"}");
        if (result->offline) g_license.clear();
        delete result;
        return 0;
    }
    if (message == WM_DESTROY) { Logout(false); PostQuitMessage(0); return 0; }
    return DefWindowProc(window,message,wParam,lParam);
}
} // namespace

int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,LPWSTR,int show) {
    CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
    WNDCLASS wc{}; wc.hInstance=instance; wc.lpfnWndProc=AppWndProc; wc.lpszClassName=L"XinGodLicenseWebView"; wc.hCursor=LoadCursor(nullptr,IDC_ARROW); RegisterClass(&wc);
    g_window=CreateWindowEx(0,wc.lpszClassName,L"XinGodSKJH 授权中心",WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX,CW_USEDEFAULT,CW_USEDEFAULT,760,650,nullptr,nullptr,instance,nullptr);
    ShowWindow(g_window,show);
    CreateCoreWebView2EnvironmentWithOptions(nullptr,nullptr,nullptr,Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>([](HRESULT hr,ICoreWebView2Environment* env)->HRESULT{
        if(FAILED(hr)||!env)return E_FAIL;
        return env->CreateCoreWebView2Controller(g_window,Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>([](HRESULT hr,ICoreWebView2Controller* value)->HRESULT{
            if(FAILED(hr)||!value)return E_FAIL; g_controller=value; g_controller->get_CoreWebView2(&g_webview); RECT bounds{};GetClientRect(g_window,&bounds);g_controller->put_Bounds(bounds);EventRegistrationToken token{};
            g_webview->add_WebMessageReceived(Callback<ICoreWebView2WebMessageReceivedEventHandler>([](ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs* args)->HRESULT{LPWSTR raw=nullptr;args->TryGetWebMessageAsString(&raw);std::wstring message=raw?raw:L"";CoTaskMemFree(raw);if(message==L"BOOTSTRAP")HandleBootstrap();else if(message.rfind(L"LOGIN:",0)==0)HandleLogin(message);else if(message==L"LOGOUT")Logout(true);return S_OK;}).Get(),&token);
            g_webview->NavigateToString(kPageHtml);return S_OK;
        }).Get());
    }).Get());
    MSG message{};while(GetMessage(&message,nullptr,0,0)){TranslateMessage(&message);DispatchMessage(&message);}CoUninitialize();return 0;
}
